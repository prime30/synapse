'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// #region agent log
const DEBUG_LOG = (msg: string, data: Record<string, unknown>, hypothesisId: string) => {
  fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useTemplateLayout.ts', message: msg, data, hypothesisId, timestamp: Date.now() }) }).catch(() => {});
};
// #endregion

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

/** File entry returned by the project files API. */
interface ProjectFile {
  id: string;
  name: string;
  path: string;
  file_type?: string;
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

/** Add a section to the raw JSON. */
function withAddedSection(
  rawJson: Record<string, unknown>,
  sectionId: string,
  sectionType: string,
): Record<string, unknown> {
  const sectionsMap = { ...(rawJson.sections as Record<string, unknown>) };
  sectionsMap[sectionId] = { type: sectionType, settings: {} };
  const order = [...((rawJson.order ?? Object.keys(sectionsMap)) as string[])];
  if (!order.includes(sectionId)) order.push(sectionId);
  return { ...rawJson, sections: sectionsMap, order };
}

/** Remove a section from the raw JSON. */
function withRemovedSection(
  rawJson: Record<string, unknown>,
  sectionId: string,
): Record<string, unknown> {
  const sectionsMap = { ...(rawJson.sections as Record<string, unknown>) };
  delete sectionsMap[sectionId];
  const order = ((rawJson.order ?? Object.keys(sectionsMap)) as string[]).filter(
    (k) => k !== sectionId,
  );
  return { ...rawJson, sections: sectionsMap, order };
}

/** Merge settings into a section in the raw JSON. */
function withUpdatedSectionSettings(
  rawJson: Record<string, unknown>,
  sectionId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const sectionsMap = { ...(rawJson.sections as Record<string, unknown>) };
  const section = { ...(sectionsMap[sectionId] as Record<string, unknown>) };
  section.settings = { ...((section.settings as Record<string, unknown>) ?? {}), ...settings };
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
  // Fetches all project files and filters to templates/*.json client-side.
  const templatesQuery = useQuery({
    queryKey: ['template-files', projectId],
    queryFn: async (): Promise<ProjectFile[]> => {
      // #region agent log
      DEBUG_LOG('templatesQuery.queryFn started', { projectId }, 'H1');
      // #endregion
      const res = await fetch(`/api/projects/${projectId}/files`);
      // #region agent log
      DEBUG_LOG('templatesQuery fetch response', { ok: res.ok, status: res.status }, 'H1');
      // #endregion
      if (!res.ok) throw new Error('Failed to fetch template files');
      const json = await res.json();
      const files: ProjectFile[] = json.data ?? json.files ?? json ?? [];
      const filtered = files
        .filter(
          (f) =>
            f.path.startsWith('templates/') && f.path.endsWith('.json'),
        )
        .map((f) => ({
          id: f.id,
          name: f.name ?? f.path.split('/').pop() ?? f.path,
          path: f.path,
        }));
      // #region agent log
      DEBUG_LOG('templatesQuery resolved', { rawKeys: Object.keys(json), filesLen: files.length, filteredLen: filtered.length, firstPath: filtered[0]?.path }, 'H2');
      // #endregion
      return filtered;
    },
    enabled: !!projectId,
  });

  // Stabilise the templates reference (react-query already memoises data)
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

  // Auto-select first template when list arrives
  if (templates.length > 0 && activeTemplate === null) {
    // Use a callback so we don't set state during render
    // The query is settled so this is safe to schedule
    queueMicrotask(() => setActiveTemplate(templates[0].path));
  }

  // Derive the file ID for the active template from the templates list.
  const activeFileId = useMemo(
    () => templates.find((t) => t.path === activeTemplate)?.id ?? null,
    [templates, activeTemplate],
  );

  // ── Fetch active template content ───────────────────────────────────────
  // Uses the per-file GET /api/files/[id] endpoint which returns content.
  const layoutQuery = useQuery({
    queryKey: ['template-layout', projectId, activeFileId],
    queryFn: async (): Promise<TemplateLayout> => {
      // #region agent log
      DEBUG_LOG('layoutQuery.queryFn started', { activeFileId }, 'H4');
      // #endregion
      const res = await fetch(`/api/files/${activeFileId}`);
      // #region agent log
      DEBUG_LOG('layoutQuery fetch response', { ok: res.ok, status: res.status }, 'H4');
      // #endregion
      if (!res.ok) throw new Error('Failed to fetch template content');
      const json = await res.json();
      const file = json.data ?? json;
      const content: string = file.content ?? '';
      const raw = JSON.parse(content) as Record<string, unknown>;
      return parseTemplateJson(raw);
    },
    enabled: !!projectId && !!activeFileId,
  });

  // #region agent log
  useEffect(() => {
    const isLoading = templatesQuery.isPending || (templates.length > 0 && (activeFileId === null || layoutQuery.isPending));
    DEBUG_LOG('templateLayout state', {
      projectId,
      projectIdEmpty: !projectId,
      templatesQueryStatus: templatesQuery.status,
      templatesQueryIsPending: templatesQuery.isPending,
      templatesLength: templates.length,
      activeTemplate,
      activeFileId,
      layoutQueryStatus: layoutQuery.status,
      layoutQueryIsPending: layoutQuery.isPending,
      isLoading,
      error: templatesQuery.error?.message ?? layoutQuery.error?.message ?? null,
    }, 'H3');
  }, [projectId, templatesQuery.status, templatesQuery.isPending, templatesQuery.error, templates.length, activeTemplate, activeFileId, layoutQuery.status, layoutQuery.isPending, layoutQuery.error]);
  // #endregion

  // ── Save mutation ───────────────────────────────────────────────────────
  // Uses PUT /api/files/[id] to update the template content.
  const saveMutation = useMutation({
    mutationFn: async (updatedJson: Record<string, unknown>) => {
      if (!activeFileId) throw new Error('No active template file ID');
      const res = await fetch(`/api/files/${activeFileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        queryKey: ['template-layout', projectId, activeFileId],
      });
    },
  });

  // ── Helper: optimistic update + mutate ──────────────────────────────────
  const applyUpdate = useCallback(
    (updatedJson: Record<string, unknown>) => {
      queryClient.setQueryData(
        ['template-layout', projectId, activeFileId],
        parseTemplateJson(updatedJson),
      );
      saveMutation.mutate(updatedJson);
    },
    [queryClient, projectId, activeFileId, saveMutation],
  );

  // ── Reorder sections ────────────────────────────────────────────────────
  const reorderSections = useCallback(
    (newOrder: string[]) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      applyUpdate(withNewSectionOrder(layout.rawJson, newOrder));
    },
    [layoutQuery.data, applyUpdate],
  );

  // ── Reorder blocks within a section ─────────────────────────────────────
  const reorderBlocks = useCallback(
    (sectionId: string, newBlockOrder: string[]) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      applyUpdate(withNewBlockOrder(layout.rawJson, sectionId, newBlockOrder));
    },
    [layoutQuery.data, applyUpdate],
  );

  // ── Add section ─────────────────────────────────────────────────────────
  const addSection = useCallback(
    (sectionType: string) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      const sectionId = `section-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      applyUpdate(withAddedSection(layout.rawJson, sectionId, sectionType));
    },
    [layoutQuery.data, applyUpdate],
  );

  // ── Remove section ──────────────────────────────────────────────────────
  const removeSection = useCallback(
    (sectionId: string) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      applyUpdate(withRemovedSection(layout.rawJson, sectionId));
    },
    [layoutQuery.data, applyUpdate],
  );

  // ── Update section settings ─────────────────────────────────────────────
  const updateSectionSettings = useCallback(
    (sectionId: string, settings: Record<string, unknown>) => {
      const layout = layoutQuery.data;
      if (!layout) return;
      applyUpdate(withUpdatedSectionSettings(layout.rawJson, sectionId, settings));
    },
    [layoutQuery.data, applyUpdate],
  );

  return {
    // Template list
    templates,
    activeTemplate,
    setActiveTemplate,

    // Layout
    layout: layoutQuery.data ?? null,

    // Section CRUD
    addSection,
    removeSection,
    updateSectionSettings,

    // Reorder actions
    reorderSections,
    reorderBlocks,

    // Status
    // Use isPending (not isLoading) so disabled queries still count as "not ready"
    isLoading:
      templatesQuery.isPending ||
      (templates.length > 0 && (activeFileId === null || layoutQuery.isPending)),
    isSaving: saveMutation.isPending,
    error:
      templatesQuery.error?.message ??
      layoutQuery.error?.message ??
      saveMutation.error?.message ??
      null,
  };
}
