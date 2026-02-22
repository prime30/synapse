/**
 * Dataset pipeline: builds LlamaFactory-compatible training data from
 * agent transcripts, harness traces, adversarial examples, and manual curation.
 *
 * Usage:
 *   npx tsx scripts/build-training-dataset.ts [--version <ver>] [--output <dir>]
 *
 * Output structure:
 *   <output>/
 *     manifest.json        — Dataset metadata and statistics
 *     sft_train.json       — SFT training split (ShareGPT format)
 *     sft_val.json         — SFT validation split
 *     sft_test.json        — SFT test split
 *     preference_train.json — DPO/ORPO training split
 *     preference_val.json  — DPO/ORPO validation split
 *     preference_test.json — DPO/ORPO test split
 *     dataset_info.json    — LlamaFactory dataset descriptor
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';

import { generateAdversarialDataset } from '../lib/finetune/adversarial-set';
import { getAllPromptFamilies, type IntentMode } from '../lib/finetune/behavior-spec';
import { sanitize, contentFingerprint } from '../lib/finetune/redaction';
import type {
  SFTExample,
  PreferenceExample,
  DatasetManifest,
  LlamaFactoryShareGPTRow,
  LlamaFactoryPreferenceRow,
} from '../lib/finetune/dataset-schema';
import {
  sftToShareGPT,
  preferenceToLlamaFactory,
} from '../lib/finetune/dataset-schema';

// ── CLI Args ─────────────────────────────────────────────────────────────────

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const DATASET_VERSION = parseArg('version') ?? `v${Date.now()}`;
const OUTPUT_DIR = parseArg('output') ?? path.join(process.cwd(), '.finetune-data');
const TRANSCRIPT_DIR = parseArg('transcripts') ?? path.join(process.cwd(), 'agent-transcripts');

// ── Transcript Ingestion ─────────────────────────────────────────────────────

interface RawTranscriptTurn {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

function parseTranscriptFile(filePath: string): RawTranscriptTurn[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const turns: RawTranscriptTurn[] = [];
  const lines = raw.split('\n');

  let currentRole: RawTranscriptTurn['role'] | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const roleMatch = line.match(/^(user|assistant|tool):\s*(.*)/);
    if (roleMatch) {
      if (currentRole) {
        turns.push({
          role: currentRole,
          content: currentContent.join('\n').trim(),
        });
      }
      currentRole = roleMatch[1] as RawTranscriptTurn['role'];
      currentContent = [roleMatch[2]];
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  if (currentRole) {
    turns.push({
      role: currentRole,
      content: currentContent.join('\n').trim(),
    });
  }

  return turns;
}

function inferModeFromTranscript(turns: RawTranscriptTurn[]): IntentMode {
  const firstUser = turns.find((t) => t.role === 'user')?.content ?? '';
  const lower = firstUser.toLowerCase();

  if (/^\s*(plan|create a plan|propose a plan)\b/.test(lower)) return 'plan';
  if (/\b(debug|diagnose|why .*not|failing|broken|error)\b/.test(lower)) return 'debug';
  if (/^(how|what|where|why)\b/.test(lower) || /\bexplain|walk me through\b/.test(lower)) return 'ask';
  return 'code';
}

function transcriptToSFTExamples(
  transcriptPath: string,
  version: string,
): SFTExample[] {
  const turns = parseTranscriptFile(transcriptPath);
  if (turns.length < 2) return [];

  const mode = inferModeFromTranscript(turns);
  const examples: SFTExample[] = [];

  const conversations = turns
    .filter((t) => t.role !== 'tool')
    .map((t) => {
      const sanitized = sanitize(t.content);
      return { role: t.role as 'user' | 'assistant', content: sanitized.text };
    });

  if (conversations.length >= 2) {
    examples.push({
      id: `transcript-${contentFingerprint(transcriptPath)}`,
      format: 'sft',
      mode,
      promptFamily: 'transcript',
      conversations,
      quality: {
        overall: 0.7,
        shopifySpecificity: 0.7,
        clarity: 0.7,
        accuracy: 0.7,
        antiPatternsTriggered: [],
        hallucinated: false,
        usedDeprecatedApis: false,
      },
      provenance: {
        source: 'transcript',
        sourceId: path.basename(transcriptPath),
        generatedAt: new Date().toISOString(),
        datasetVersion: version,
        redactionApplied: true,
      },
      split: 'train',
    });
  }

  return examples;
}

// ── Synthetic Examples from Behavior Spec ────────────────────────────────────

function generateSyntheticExamples(version: string): SFTExample[] {
  const families = getAllPromptFamilies();
  const examples: SFTExample[] = [];

  for (const family of families) {
    for (const prompt of family.examples) {
      examples.push({
        id: `synthetic-${contentFingerprint(prompt)}`,
        format: 'sft',
        mode: family.mode,
        promptFamily: family.id,
        conversations: [
          { role: 'user', content: prompt },
          {
            role: 'assistant',
            content: `[Placeholder: high-quality ${family.mode}-mode response for "${prompt}". Replace with curated gold-standard response.]`,
          },
        ],
        quality: {
          overall: 0.5,
          shopifySpecificity: 0.5,
          clarity: 0.5,
          accuracy: 0.5,
          antiPatternsTriggered: [],
          hallucinated: false,
          usedDeprecatedApis: false,
        },
        provenance: {
          source: 'synthetic',
          sourceId: family.id,
          generatedAt: new Date().toISOString(),
          datasetVersion: version,
          redactionApplied: false,
        },
        split: 'train',
      });
    }
  }

  return examples;
}

// ── Split Assignment ─────────────────────────────────────────────────────────

function assignSplits<T extends { id: string; split: string }>(
  examples: T[],
  trainRatio = 0.8,
  valRatio = 0.1,
): T[] {
  const sorted = [...examples].sort((a, b) => {
    const hashA = createHash('sha256').update(a.id).digest('hex');
    const hashB = createHash('sha256').update(b.id).digest('hex');
    return hashA.localeCompare(hashB);
  });

  return sorted.map((ex, i) => {
    const frac = i / sorted.length;
    if (frac < trainRatio) return { ...ex, split: 'train' };
    if (frac < trainRatio + valRatio) return { ...ex, split: 'val' };
    return { ...ex, split: 'test' };
  });
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicate<T extends { id: string }>(examples: T[]): T[] {
  const seen = new Set<string>();
  return examples.filter((ex) => {
    if (seen.has(ex.id)) return false;
    seen.add(ex.id);
    return true;
  });
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

function main() {
  console.log(`Building training dataset version ${DATASET_VERSION}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Ingest transcripts
  const transcriptSFT: SFTExample[] = [];
  if (fs.existsSync(TRANSCRIPT_DIR)) {
    const files = fs.readdirSync(TRANSCRIPT_DIR).filter((f) => f.endsWith('.txt'));
    console.log(`Found ${files.length} transcript file(s)`);
    for (const file of files) {
      const examples = transcriptToSFTExamples(
        path.join(TRANSCRIPT_DIR, file),
        DATASET_VERSION,
      );
      transcriptSFT.push(...examples);
    }
  } else {
    console.log('No transcript directory found, skipping transcript ingestion');
  }

  // 2. Generate synthetic examples from behavior spec
  const syntheticSFT = generateSyntheticExamples(DATASET_VERSION);
  console.log(`Generated ${syntheticSFT.length} synthetic example(s)`);

  // 3. Generate adversarial examples
  const adversarial = generateAdversarialDataset(DATASET_VERSION);
  console.log(
    `Generated ${adversarial.sft.length} adversarial SFT + ${adversarial.preference.length} preference example(s)`,
  );

  // 4. Merge and deduplicate
  let allSFT = deduplicate([
    ...transcriptSFT,
    ...syntheticSFT,
    ...adversarial.sft,
  ]);
  let allPreference = deduplicate([...adversarial.preference]);

  // 5. Assign splits
  allSFT = assignSplits(allSFT);
  allPreference = assignSplits(allPreference);

  // 6. Convert to LlamaFactory formats
  const sftBySplit: Record<string, LlamaFactoryShareGPTRow[]> = {
    train: [],
    val: [],
    test: [],
  };
  const prefBySplit: Record<string, LlamaFactoryPreferenceRow[]> = {
    train: [],
    val: [],
    test: [],
  };

  const modeDistribution: Record<IntentMode, number> = {
    ask: 0,
    plan: 0,
    code: 0,
    debug: 0,
  };
  const familyDistribution: Record<string, number> = {};

  for (const ex of allSFT) {
    sftBySplit[ex.split].push(sftToShareGPT(ex));
    modeDistribution[ex.mode]++;
    familyDistribution[ex.promptFamily] =
      (familyDistribution[ex.promptFamily] ?? 0) + 1;
  }

  for (const ex of allPreference) {
    prefBySplit[ex.split].push(preferenceToLlamaFactory(ex));
    modeDistribution[ex.mode]++;
    familyDistribution[ex.promptFamily] =
      (familyDistribution[ex.promptFamily] ?? 0) + 1;
  }

  // 7. Write files
  for (const split of ['train', 'val', 'test'] as const) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `sft_${split}.json`),
      JSON.stringify(sftBySplit[split], null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `preference_${split}.json`),
      JSON.stringify(prefBySplit[split], null, 2),
      'utf8',
    );
  }

  // 8. Write manifest
  const allContent = JSON.stringify({ allSFT, allPreference });
  const contentHash = createHash('sha256').update(allContent).digest('hex').slice(0, 16);

  const manifest: DatasetManifest = {
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    baseModel: 'TBD',
    counts: {
      sft: {
        train: sftBySplit.train.length,
        val: sftBySplit.val.length,
        test: sftBySplit.test.length,
      },
      preference: {
        train: prefBySplit.train.length,
        val: prefBySplit.val.length,
        test: prefBySplit.test.length,
      },
    },
    modeDistribution,
    promptFamilyDistribution: familyDistribution,
    adversarialCount: adversarial.sft.length,
    contentHash,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  // 9. Write LlamaFactory dataset_info.json
  const datasetInfo = {
    synapse_sft_train: {
      file_name: 'sft_train.json',
      formatting: 'sharegpt',
      columns: { messages: 'conversations' },
      tags: { role_tag: 'from', content_tag: 'value', user_tag: 'human', assistant_tag: 'gpt', system_tag: 'system' },
    },
    synapse_sft_val: {
      file_name: 'sft_val.json',
      formatting: 'sharegpt',
      columns: { messages: 'conversations' },
      tags: { role_tag: 'from', content_tag: 'value', user_tag: 'human', assistant_tag: 'gpt', system_tag: 'system' },
    },
    synapse_preference_train: {
      file_name: 'preference_train.json',
      formatting: 'sharegpt',
      columns: { messages: 'conversations', chosen: 'chosen', rejected: 'rejected' },
      tags: { role_tag: 'from', content_tag: 'value', user_tag: 'human', assistant_tag: 'gpt', system_tag: 'system' },
    },
    synapse_preference_val: {
      file_name: 'preference_val.json',
      formatting: 'sharegpt',
      columns: { messages: 'conversations', chosen: 'chosen', rejected: 'rejected' },
      tags: { role_tag: 'from', content_tag: 'value', user_tag: 'human', assistant_tag: 'gpt', system_tag: 'system' },
    },
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'dataset_info.json'),
    JSON.stringify(datasetInfo, null, 2),
    'utf8',
  );

  // 10. Summary
  console.log('\n=== Dataset Build Summary ===');
  console.log(`Version: ${DATASET_VERSION}`);
  console.log(`Content hash: ${contentHash}`);
  console.log(
    `SFT: train=${sftBySplit.train.length}, val=${sftBySplit.val.length}, test=${sftBySplit.test.length}`,
  );
  console.log(
    `Preference: train=${prefBySplit.train.length}, val=${prefBySplit.val.length}, test=${prefBySplit.test.length}`,
  );
  console.log(`Mode distribution: ${JSON.stringify(modeDistribution)}`);
  console.log(`Adversarial examples: ${adversarial.sft.length}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

main();
