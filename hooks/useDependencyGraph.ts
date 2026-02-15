'use client';

import { useMemo } from 'react';
import { extractLiquidReferences } from '@/lib/shopify/theme-grouping';

export interface DependencyEdge {
  sourceId: string;
  sourcePath: string;
  targetPath: string;
  type: 'render' | 'include' | 'section' | 'asset';
}

/**
 * Extract outgoing dependencies from a single file's content.
 * Returns file paths that the given content references.
 */
export function extractFileDependencies(content: string): {
  renders: string[];
  includes: string[];
  sections: string[];
  assets: string[];
} {
  const refs = extractLiquidReferences(content);
  return {
    renders: refs.renders.map(r => `snippets/${r}.liquid`),
    includes: refs.includes.map(r => `snippets/${r}.liquid`),
    sections: refs.sections.map(r => `sections/${r}.liquid`),
    assets: refs.assetUrls.map(a => `assets/${a}`),
  };
}

/**
 * Hook to get dependencies for a single active file.
 * Returns the paths this file depends on.
 */
export function useFileDependencies(content: string | null) {
  return useMemo(() => {
    if (!content) return { renders: [], includes: [], sections: [], assets: [] };
    return extractFileDependencies(content);
  }, [content]);
}
