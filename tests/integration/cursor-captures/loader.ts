/**
 * Loads Cursor agent capture files for inclusion in head-to-head comparisons.
 * Captures are optional — the test suite runs fine without them.
 */

import fs from 'fs';
import path from 'path';
import type { CursorCapture } from './types';

const CAPTURES_DIR = path.dirname(new URL(import.meta.url).pathname);

/**
 * Attempt to load a Cursor capture for a given scenario.
 * Returns null if no capture file exists.
 */
export function loadCursorCapture(scenario: string): CursorCapture | null {
  // Normalize Windows paths (import.meta.url gives file:///C:/... on Windows)
  let capturesDir = CAPTURES_DIR;
  if (capturesDir.startsWith('/') && process.platform === 'win32') {
    capturesDir = capturesDir.slice(1); // Remove leading / on Windows
  }

  const filePath = path.join(capturesDir, `${scenario}-cursor.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const capture: CursorCapture = JSON.parse(raw);

    // Basic validation
    if (!capture.scenario || !capture.responseText) {
      console.warn(`[cursor-capture] Invalid capture file ${filePath}: missing scenario or responseText`);
      return null;
    }

    return capture;
  } catch {
    // File doesn't exist or is invalid — that's fine
    return null;
  }
}

/**
 * List all available Cursor captures.
 */
export function listCursorCaptures(): string[] {
  let capturesDir = CAPTURES_DIR;
  if (capturesDir.startsWith('/') && process.platform === 'win32') {
    capturesDir = capturesDir.slice(1);
  }

  try {
    return fs.readdirSync(capturesDir)
      .filter(f => f.endsWith('-cursor.json'))
      .map(f => f.replace('-cursor.json', ''));
  } catch {
    return [];
  }
}
