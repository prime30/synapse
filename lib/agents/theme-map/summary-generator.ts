/**
 * LLM-enriched file summary generator.
 * Generates 1-2 sentence functional descriptions for theme files.
 * Uses the cheapest available model, batches files, and caches by content hash.
 */

import type { ThemeMap, ThemeMapFile } from './types';
import { setThemeMap } from './cache';

const SUMMARY_PROMPT = `You are analyzing Shopify theme files. For each file, provide a 1-2 sentence summary describing what the file does. Focus on what the code does, not just how it's written. Include key CSS classes, Liquid objects, JS functions, and schema settings.

Respond with a JSON object mapping file paths to summaries. Example:
{"sections/header.liquid": "Renders the site header with logo, navigation menu, and search bar. Uses section schema for menu configuration and announcement bar toggle."}`;

const BATCH_SIZE = 8;
const MAX_CONTENT_LENGTH = 4000;

async function computeHash(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

interface FileForSummary {
  path: string;
  content: string;
}

async function generateBatchSummaries(
  files: FileForSummary[],
): Promise<Record<string, string>> {
  const providers = [
    { name: 'anthropic', check: () => !!process.env.ANTHROPIC_API_KEY },
    { name: 'google', check: () => !!process.env.GOOGLE_AI_API_KEY },
    { name: 'openai', check: () => !!process.env.OPENAI_API_KEY },
  ];

  const available = providers.find(p => p.check());
  if (!available) return {};

  const fileList = files.map(f => `--- ${f.path} ---\n${f.content.slice(0, MAX_CONTENT_LENGTH)}`).join('\n\n');
  const userPrompt = `Summarize these ${files.length} theme files:\n\n${fileList}`;

  try {
    let result = '';

    if (available.name === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 2048,
          system: SUMMARY_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!resp.ok) return {};
      const data = await resp.json() as { content: Array<{ text: string }> };
      result = data.content?.[0]?.text ?? '';
    } else if (available.name === 'google') {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${SUMMARY_PROMPT}\n\n${userPrompt}` }] }],
          }),
        },
      );
      if (!resp.ok) return {};
      const data = await resp.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
      result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SUMMARY_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 2048,
        }),
      });
      if (!resp.ok) return {};
      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      result = data.choices?.[0]?.message?.content ?? '';
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as Record<string, string>;
  } catch (err) {
    console.warn('[summary-generator] Batch failed:', err);
    return {};
  }
}

export async function generateFileSummaries(
  projectId: string,
  files: FileForSummary[],
  themeMap: ThemeMap,
): Promise<ThemeMap> {
  let updatedMap = { ...themeMap, schemaVersion: 2 };
  const filesToSummarize: FileForSummary[] = [];

  for (const file of files) {
    const existing = updatedMap.files[file.path];
    if (!existing) continue;

    const hash = await computeHash(file.content);
    if (existing.llmSummary && existing.summaryContentHash === hash) continue;

    filesToSummarize.push(file);
    updatedMap.files[file.path] = { ...existing, contentHash: hash };
  }

  if (filesToSummarize.length === 0) {
    setThemeMap(projectId, updatedMap);
    return updatedMap;
  }

  console.log(`[summary-generator] Generating summaries for ${filesToSummarize.length} files`);

  for (let i = 0; i < filesToSummarize.length; i += BATCH_SIZE) {
    const batch = filesToSummarize.slice(i, i + BATCH_SIZE);
    const summaries = await generateBatchSummaries(batch);

    for (const file of batch) {
      const summary = summaries[file.path];
      if (summary && updatedMap.files[file.path]) {
        const hash = await computeHash(file.content);
        updatedMap = {
          ...updatedMap,
          files: {
            ...updatedMap.files,
            [file.path]: {
              ...updatedMap.files[file.path],
              llmSummary: summary,
              summaryContentHash: hash,
            },
          },
        };
      }
    }

    if (i + BATCH_SIZE < filesToSummarize.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  setThemeMap(projectId, updatedMap);
  console.log(`[summary-generator] Completed summaries for ${filesToSummarize.length} files`);
  return updatedMap;
}

export function cleanOrphanSummaries(themeMap: ThemeMap, currentFilePaths: Set<string>): ThemeMap {
  const cleaned = { ...themeMap, files: { ...themeMap.files } };
  let removed = 0;
  for (const path of Object.keys(cleaned.files)) {
    if (!currentFilePaths.has(path)) {
      delete cleaned.files[path];
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[summary-generator] Removed ${removed} orphan entries`);
  }
  return cleaned;
}
