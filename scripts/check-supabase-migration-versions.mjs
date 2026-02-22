#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');
const VERSION_RE = /^(\d+)_.*\.sql$/i;

async function main() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const seen = new Map();
  const duplicates = [];
  const badFormat = [];

  for (const file of files) {
    const match = file.match(VERSION_RE);
    if (!match) {
      badFormat.push(file);
      continue;
    }
    const version = match[1];
    const existing = seen.get(version);
    if (existing) {
      duplicates.push([version, existing, file]);
      continue;
    }
    seen.set(version, file);
  }

  if (badFormat.length === 0 && duplicates.length === 0) {
    console.log(`[migrations] OK: ${files.length} SQL files with unique numeric prefixes.`);
    return;
  }

  if (badFormat.length > 0) {
    console.error('[migrations] Invalid migration filename format (expected NNN_name.sql):');
    for (const file of badFormat) {
      console.error(`  - ${file}`);
    }
  }

  if (duplicates.length > 0) {
    console.error('[migrations] Duplicate migration version prefixes detected:');
    for (const [version, firstFile, dupFile] of duplicates) {
      console.error(`  - ${version}: ${firstFile} conflicts with ${dupFile}`);
    }
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('[migrations] Failed to validate migration versions:', error);
  process.exitCode = 1;
});
