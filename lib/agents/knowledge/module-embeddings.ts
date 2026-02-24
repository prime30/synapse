/**
 * Module embeddings — lightweight semantic matching using word-frequency vectors.
 * No external API needed; uses cosine similarity over vocabulary-based vectors.
 */

import type { KnowledgeModule } from './module-matcher';

/** Simple cosine similarity for comparing embeddings */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

/** Simple word-frequency vector for lightweight semantic matching (no external API needed) */
export function textToVector(text: string, vocabulary: string[]): number[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  return vocabulary.map((term) => {
    const count = words.filter((w) => w === term || w.includes(term)).length;
    return count / Math.max(words.length, 1);
  });
}

/** Build a shared vocabulary from all module keywords + descriptions */
export function buildVocabulary(modules: KnowledgeModule[]): string[] {
  const terms = new Set<string>();
  for (const m of modules) {
    for (const kw of m.keywords) terms.add(kw.toLowerCase());
    const descWords = (m.id + ' ' + m.keywords.join(' ')).toLowerCase().split(/\W+/);
    for (const w of descWords) if (w.length > 2) terms.add(w);
  }
  return [...terms];
}

/** Cache for pre-computed module vectors */
const moduleVectorCache = new Map<string, number[]>();

export function getModuleVector(module: KnowledgeModule, vocabulary: string[]): number[] {
  const cached = moduleVectorCache.get(module.id);
  if (cached) return cached;
  const vector = textToVector(module.keywords.join(' ') + ' ' + module.id, vocabulary);
  moduleVectorCache.set(module.id, vector);
  return vector;
}

export function semanticScore(
  userMessage: string,
  module: KnowledgeModule,
  vocabulary: string[]
): number {
  const userVector = textToVector(userMessage, vocabulary);
  const moduleVector = getModuleVector(module, vocabulary);
  return cosineSimilarity(userVector, moduleVector);
}
