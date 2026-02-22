import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['app', 'components', 'hooks', 'lib'];
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md']);
const EMOJI_REGEX = /[\u{1F000}-\u{1FAFF}]|[\u2600-\u27BF]\uFE0F/gu;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const violations = [];

  for (const relDir of TARGET_DIRS) {
    const absDir = path.join(ROOT, relDir);
    try {
      await fs.access(absDir);
    } catch {
      continue;
    }

    const files = await walk(absDir);
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(line)) {
          violations.push({
            file: path.relative(ROOT, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log('No emojis found in IDE/website source.');
    return;
  }

  console.error('Emoji usage is not allowed in IDE/website source. Replace with Lucide icons:');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.content}`);
  }
  process.exitCode = 1;
}

await main();
