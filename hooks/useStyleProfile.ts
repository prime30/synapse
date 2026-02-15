'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { detectStyle, formatStyleGuide, type StyleProfile } from '@/lib/ai/style-detector';

const CACHE_KEY_PREFIX = 'synapse-style-profile-';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedProfile {
  profile: StyleProfile;
  timestamp: number;
}

function loadCachedProfile(projectId: string): StyleProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + projectId);
    if (!raw) return null;
    const cached: CachedProfile = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached.profile;
  } catch {
    return null;
  }
}

function saveCachedProfile(projectId: string, profile: StyleProfile): void {
  if (typeof window === 'undefined') return;
  try {
    const cached: CachedProfile = { profile: profile, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY_PREFIX + projectId, JSON.stringify(cached));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Phase 6b: Detects and caches the project's coding style.
 * Fetches a sample of files on first load, analyzes them, and caches the result.
 */
export function useStyleProfile(projectId: string) {
  const [profile, setProfile] = useState<StyleProfile | null>(function() {
    return loadCachedProfile(projectId);
  });
  const [isDetecting, setIsDetecting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(function() {
    mountedRef.current = true;
    return function() { mountedRef.current = false; };
  }, []);

  const detect = useCallback(async function() {
    setIsDetecting(true);
    try {
      // Fetch file list
      const res = await fetch('/api/projects/' + projectId + '/files/count');
      if (!res.ok) return;
      const data = await res.json();
      const fileList: Array<{ id: string; path: string }> = data.files || [];

      // Sample up to 10 representative files
      const samplePaths = fileList
        .filter(function(f) {
          return f.path.endsWith('.liquid') || f.path.endsWith('.css') || f.path.endsWith('.js') || f.path.endsWith('.json');
        })
        .slice(0, 10);

      if (samplePaths.length === 0) return;

      // Fetch file contents
      const fileContents: Array<{ path: string; content: string }> = [];
      for (let i = 0; i < samplePaths.length; i++) {
        const fileRes = await fetch('/api/projects/' + projectId + '/files?path=' + encodeURIComponent(samplePaths[i].path));
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          if (fileData.content) {
            fileContents.push({ path: samplePaths[i].path, content: fileData.content });
          }
        }
      }

      if (!mountedRef.current) return;

      const detected = detectStyle(fileContents);
      setProfile(detected);
      saveCachedProfile(projectId, detected);
    } catch {
      // Silently fail
    } finally {
      if (mountedRef.current) setIsDetecting(false);
    }
  }, [projectId]);

  // Auto-detect on mount if no cached profile
  useEffect(function() {
    if (!profile) {
      detect();
    }
  }, [profile, detect]);

  const styleGuide = profile ? formatStyleGuide(profile) : '';

  return {
    profile: profile,
    isDetecting: isDetecting,
    styleGuide: styleGuide,
    detect: detect,
  };
}
