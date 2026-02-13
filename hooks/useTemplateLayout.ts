'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateBlock {
  id: string;
  type: string;
  settings: Record<string, unknown>;
}

export interface TemplateSection {
  id: string; // key in the sections map (e.g. "hero")
  type: string; // section type (e.g. "hero-banner")
  settings: Record<string, unknown>;
  blocks: TemplateBlock[];
}

export interface TemplateLayout {
  sections: TemplateSection[];
  rawJson: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a Shopify template JSON into an ordered list of sections. */
function parseTemplateJson(raw: Record<string, unknown>): TemplateLayout {
  const sectionsMap = (raw.sections ?? {}) as Record<
    string,
    {
      type?: string;
      settings?: Record<string, unknown>;
      blocks?: Record<string, { type?: string; settings?: Record<string, unknown> }>;
      block_order?: string[];
    }
  >;

  const order = (raw.order ?? Object.keys(sectionsMap)) as string[];

  const sections: TemplateSection[] = order
    .filter((key) => key in sectionsMap)
    .map((key) => {
      const entry = sectionsMap[key];
      if (!entry || typeof entry !== 'object') return null;
      const blocksMap = entry.blocks ?? {};
      const blockOrder = entry.block_order ?? Object.keys(blocksMap);

      const blocks: TemplateBlock[] = blockOrder
        .filter((bk) => bk in blocksMap)
        .map((bk) => ({
          id: bk,
          type: blocksMap[bk].type ?? 'unknown',
          settings: blocksMap[bk].settings ?? {},
        }));

      return {
        id: key,
        type: entry.type ?? 'unknown',
        settings: entry.settings ?? {},
        blocks,
      };
    })
    .filter((s): s is TemplateSection => s !== null);

  return { sections, rawJson: raw };
}

/** Rebuild the raw JSON with a new section order. */
function withNewSectionOrder(
  rawJson: Record<string, unknown>,
  newOrder: string[],
): Record<string, unknown> {
  return { ...rawJson, order: newOrder };
}

/** Rebuild the raw JSON with a new block order inside a specific section. */
function withNewBlockOrder(
  rawJson: Record<string, unknown>,
  sectionId: string,
  newBlockOrder: string[],
): Record<string, unknown> {
  const sectionsMap = { ...(rawJson.sections as Record<string, unknown>) };
  const section = { ...(sectionsMap[sectionId] as Record<string, unknown>) };
  section.block_order = newBlockOrder;
  sectionsMap[sectionId] = section;
  return { ...rawJson, sections: sectionsMap };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTemplateLayout(projectId: string) {
  const queryClient = useQueryClient();
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  // ── List template files ─────────────────────────────────────────────────
  const templatesQuery = useQuery({
    queryKey: ['template-files', projectId],
    queryFn: async (): Promise<{ name: string; path: string }[]> => {
      const res = await fetch(
        `/api/projects/${projectId}/files?path=templates/`,
      );
      if (!res.ok) throw new Error('Failed to fetch template files');
      const json = await res.json();
      const files: { path: string; name?: string }[] = json.data ?? json.files ?? json ?? [];
      return files
        .filter((f) => f.path.endsWith('.json'))
        .map((f) => ({
          name: f.name ?? f.path.split('/').pop() ?? f.path,
          path: f.path,
        }));
    },
    enabled: !!projectId,
  });

  // Auto-select first template when list arrives
  const templates = templatesQuery.data ?? [];
  if (templates.length > 0 && activeTemplate === null) {
    // Use a callback so we don't set state during render
    // The query is settled so this is safe to schedule
    queueMicrotask(() => setActiveTemplate(templates[0].path));
  }

  // ── Fetch active template content ───────────────────────────────────────
  const layoutQuery = useQuery({
    queryKey: ['template-layout', projectId, activeTemplate],
    queryFn: async (): Promise<TemplateLayout> => {
      const res = await fetch(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(activeTemplate!)}`,
      );
      if (!res.ok) throw new Error('Failed to fetch template content');
      const json = await res.json();
      const content: string = json.data?.content ?? json.content ?? '';
      const raw = JSON.parse(content) as Record<string, unknown>;
      return parseTemplateJson(raw);
    },
    enabled: !!projectId && !!activeTemplate,
  });

  // ── Save mutation ───────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (updatedJson: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeTemplate,
          content: JSON.stringify(updatedJson, null, 2),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to save template');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['template-layout', projectId, activeTemplate],
      });
    },
  });

  // ── Reorder sections ────────────────────────────────────────────────────
  const reorderSections = useCallback(
    (newOrder: string[]) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      const updated = withNewSectionOrder(layout.rawJson, newOrder);
      // Optimistic update
      queryClient.setQueryData(
        ['template-layout', projectId, activeTemplate],
        parseTemplateJson(updated),
      );
      saveMutation.mutate(updated);
    },
    [layoutQuery.data, queryClient, projectId, activeTemplate, saveMutation],
  );

  // ── Reorder blocks within a section ─────────────────────────────────────
  const reorderBlocks = useCallback(
    (sectionId: string, newBlockOrder: string[]) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      const updated = withNewBlockOrder(layout.rawJson, sectionId, newBlockOrder);
      // Optimistic update
      queryClient.setQueryData(
        ['template-layout', projectId, activeTemplate],
        parseTemplateJson(updated),
      );
      saveMutation.mutate(updated);
    },
    [layoutQuery.data, queryClient, projectId, activeTemplate, saveMutation],
  );

  return {
    // Template list
    templates,
    activeTemplate,
    setActiveTemplate,

    // Layout
    layout: layoutQuery.data ?? null,

    // Reorder actions
    reorderSections,
    reorderBlocks,

    // Status
    isLoading: templatesQuery.isLoading || layoutQuery.isLoading,
    isSaving: saveMutation.isPending,
    error:
      templatesQuery.error?.message ??
      layoutQuery.error?.message ??
      saveMutation.error?.message ??
      null,
  };
}
