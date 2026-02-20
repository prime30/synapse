/**
 * Build Verification: Feature Flag Consistency
 * Cross-checks .env.example flags against lib/ai/feature-flags.ts
 * Run with: npx tsx scripts/verify-flags.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');

const envContent = fs.readFileSync(path.join(root, '.env.example'), 'utf-8');
const flagsContent = fs.readFileSync(path.join(root, 'lib', 'ai', 'feature-flags.ts'), 'utf-8');

const envFlags = new Set<string>();
const envRegex = /^(ENABLE_[A-Z_]+)/gm;
let match: RegExpExecArray | null;
while ((match = envRegex.exec(envContent)) !== null) {
  envFlags.add(match[1]);
}

const nextPublicEnvRegex = /^(NEXT_PUBLIC_ENABLE_[A-Z_]+)/gm;
while ((match = nextPublicEnvRegex.exec(envContent)) !== null) {
  envFlags.add(match[1]);
}

const codeFlags = new Set<string>();
const codeRegex = /process\.env\.((?:NEXT_PUBLIC_)?ENABLE_[A-Z_]+)/g;
while ((match = codeRegex.exec(flagsContent)) !== null) {
  codeFlags.add(match[1]);
}

const otherEnvRegex = /process\.env\.(PROMPT_CACHE_[A-Z_]+)/g;
while ((match = otherEnvRegex.exec(flagsContent)) !== null) {
  codeFlags.add(match[1]);
}

const inEnvOnly = [...envFlags].filter((f) => !codeFlags.has(f));
const inCodeOnly = [...codeFlags].filter((f) => !envFlags.has(f));
const shared = [...envFlags].filter((f) => codeFlags.has(f));

console.log('\n════════════════════════════════════════════════');
console.log('  Feature Flag Consistency Check');
console.log('════════════════════════════════════════════════');
console.log(`  .env.example flags:  ${envFlags.size}`);
console.log(`  feature-flags.ts:    ${codeFlags.size}`);
console.log(`  Matched:             ${shared.length}`);
console.log(`  In .env only:        ${inEnvOnly.length}`);
console.log(`  In code only:        ${inCodeOnly.length}`);
console.log('════════════════════════════════════════════════\n');

if (shared.length > 0) {
  console.log('Matched flags:');
  for (const f of shared.sort()) console.log(`  ✓ ${f}`);
  console.log();
}

if (inEnvOnly.length > 0) {
  console.log('In .env.example but NOT in feature-flags.ts (may be consumed elsewhere):');
  for (const f of inEnvOnly.sort()) console.log(`  ⚠ ${f}`);
  console.log();
}

if (inCodeOnly.length > 0) {
  console.log('In feature-flags.ts but NOT in .env.example (should be documented):');
  for (const f of inCodeOnly.sort()) console.log(`  ⚠ ${f}`);
  console.log();
}

const report = {
  phase: '1f',
  name: 'Feature Flag Consistency',
  timestamp: new Date().toISOString(),
  envFlagCount: envFlags.size,
  codeFlagCount: codeFlags.size,
  matched: shared.sort(),
  inEnvOnly: inEnvOnly.sort(),
  inCodeOnly: inCodeOnly.sort(),
  result: inCodeOnly.length === 0 ? 'PASS' : 'WARN',
};

fs.writeFileSync(
  path.join(root, '.verification', 'flags.json'),
  JSON.stringify(report, null, 2),
);
console.log('Report written to .verification/flags.json');
