'use client';

import { useEffect, useRef, useCallback } from 'react';

const STORAGE_PREFIX = 'synapse-draft-';
const INTERVAL_MS = 30000;

export function useAutoSave(
  fileId: string | null,
  content: string,
  isDirty: boolean
) {
  const contentRef = useRef(content);

  const saveToStorage = useCallback(() => {
    if (!fileId || !isDirty) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${fileId}`, contentRef.current);
    } catch {
      // Ignore storage errors
    }
  }, [fileId, isDirty]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!fileId || !isDirty) return;

    const id = setInterval(() => {
      saveToStorage();
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [fileId, isDirty, saveToStorage]);

  const loadDraft = useCallback((fileId: string | null): string | null => {
    if (!fileId) return null;
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${fileId}`);
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback((fileId: string | null) => {
    if (!fileId) return;
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${fileId}`);
    } catch {
      // Ignore
    }
  }, []);

  return { loadDraft, clearDraft };
}
