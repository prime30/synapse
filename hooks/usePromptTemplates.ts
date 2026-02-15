'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { PromptTemplate, TemplateCategory } from '@/lib/ai/prompt-templates';
import { BUILT_IN_TEMPLATES } from '@/lib/ai/prompt-templates';

const STORAGE_KEY = 'synapse-custom-templates';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadCustomTemplates(): PromptTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromptTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: PromptTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch { /* quota exceeded or similar */ }
}

export function usePromptTemplates() {
  const [customTemplates, setCustomTemplates] = useState<PromptTemplate[]>(() => loadCustomTemplates());

  // Save custom templates to localStorage whenever they change
  useEffect(() => {
    saveCustomTemplates(customTemplates);
  }, [customTemplates]);

  const templates = useMemo(
    () => [...BUILT_IN_TEMPLATES, ...customTemplates],
    [customTemplates],
  );

  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category));
    return Array.from(cats) as TemplateCategory[];
  }, [templates]);

  const addTemplate = useCallback(
    (template: Omit<PromptTemplate, 'id' | 'builtIn'>) => {
      const newTemplate: PromptTemplate = {
        ...template,
        id: generateId(),
        builtIn: false,
      };
      setCustomTemplates((prev) => [...prev, newTemplate]);
    },
    [],
  );

  const removeTemplate = useCallback((id: string) => {
    setCustomTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const filterByCategory = useCallback(
    (category: TemplateCategory | null): PromptTemplate[] => {
      if (!category) return templates;
      return templates.filter((t) => t.category === category);
    },
    [templates],
  );

  const searchTemplates = useCallback(
    (query: string): PromptTemplate[] => {
      if (!query.trim()) return templates;
      const q = query.toLowerCase();
      return templates.filter(
        (t) => t.label.toLowerCase().includes(q) || t.prompt.toLowerCase().includes(q),
      );
    },
    [templates],
  );

  return {
    templates,
    categories,
    addTemplate,
    removeTemplate,
    filterByCategory,
    searchTemplates,
  };
}
