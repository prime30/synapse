import fs from 'fs';
import { execSync } from 'child_process';

const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node scripts/bump-version.mjs [patch|minor|major]');
  process.exit(1);
}

// Bump root package.json (no git tag — we tag manually after reviewing)
execSync(`npm version ${bumpType} --no-git-tag-version`, { stdio: 'inherit' });

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

// Sync the same version into electron/package.json
const electronPkgPath = 'electron/package.json';
const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf-8'));
electronPkg.version = version;
fs.writeFileSync(electronPkgPath, JSON.stringify(electronPkg, null, 2) + '\n');

console.log(`\nBumped to v${version}`);
console.log('\nNext steps:');
console.log(`  git add package.json electron/package.json`);
console.log(`  git commit -m "chore: bump version to v${version}"`);
console.log(`  git tag v${version}`);
console.log(`  git push origin main --tags`);
