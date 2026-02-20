/**
 * Copies the most recent v2-bench-*.json from tests/integration/results/
 * to lib/benchmarks/latest-results.json so the features/benchmarks page
 * displays that run.
 *
 * Usage: npx tsx scripts/sync-benchmark-results.ts
 */

import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const resultsDir = path.join(projectRoot, 'tests', 'integration', 'results');
const destPath = path.join(projectRoot, 'lib', 'benchmarks', 'latest-results.json');

const files = fs.readdirSync(resultsDir, { withFileTypes: true })
  .filter((f) => f.isFile() && f.name.startsWith('v2-bench-') && f.name.endsWith('.json'))
  .map((f) => f.name)
  .sort()
  .reverse();

if (files.length === 0) {
  console.error('No v2-bench-*.json files in tests/integration/results/');
  process.exit(1);
}

const latestFile = path.join(resultsDir, files[0]);
const data = fs.readFileSync(latestFile, 'utf-8');
fs.writeFileSync(destPath, data, 'utf-8');
console.log('Synced', files[0], '-> lib/benchmarks/latest-results.json');
