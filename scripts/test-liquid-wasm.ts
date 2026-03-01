import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

async function test() {
  const { Parser, Language } = await import('web-tree-sitter');
  await Parser.init({
    locateFile(scriptName: string) {
      return resolve('public/tree-sitter', scriptName);
    },
  });

  const Liquid = await Language.load(resolve('public/tree-sitter/tree-sitter-liquid.wasm'));
  const parser = new Parser();
  parser.setLanguage(Liquid);
  const themeDir = '.synapse-themes/f70d9af0-copy-of-copy-of-copy-of-swatches-with-nicknames';
  const liquidFiles: string[] = [];
  for (const dir of ['sections', 'snippets', 'layout']) {
    try {
      const files = readdirSync(join(themeDir, dir)).filter(f => f.endsWith('.liquid'));
      for (const f of files.slice(0, 5)) liquidFiles.push(join(themeDir, dir, f));
    } catch { /* dir not found */ }
  }

  console.log(`Testing ${liquidFiles.length} Liquid files...\n`);
  let passed = 0;
  let schemaNodes = 0;
  let renderNodes = 0;

  for (const filePath of liquidFiles) {
    const code = readFileSync(filePath, 'utf-8');
    const tree = parser.parse(code);
    if (!tree) continue;
    const root = tree.rootNode;
    let hasSchema = false;
    let hasRender = false;

    function walk(node: any) {
      if (node.type === 'schema_statement') { hasSchema = true; schemaNodes++; }
      if (node.type === 'render_statement' || node.type === 'include_statement') { hasRender = true; renderNodes++; }
      for (let i = 0; i < node.childCount; i++) walk(node.child(i)!);
    }
    walk(root);

    const errors = root.hasError;
    const fileName = filePath.split(/[/\\]/).pop();
    const status = errors ? 'WARN' : 'PASS';
    console.log(`${status}: ${fileName} (${code.length} chars, ${root.childCount} top nodes${hasSchema ? ', has schema' : ''}${hasRender ? ', has render' : ''}${errors ? ', HAS ERRORS' : ''})`);
    if (!errors) passed++;
  }

  console.log(`\nResult: ${passed}/${liquidFiles.length} parsed without errors`);
  console.log(`Schema nodes found: ${schemaNodes}`);
  console.log(`Render/include nodes found: ${renderNodes}`);

  // Test schema extraction on a section file
  const sectionFile = liquidFiles.find(f => f.includes('sections/'));
  if (sectionFile) {
    console.log(`\n--- Schema extraction test: ${sectionFile.split(/[/\\]/).pop()} ---`);
    const code = readFileSync(sectionFile, 'utf-8');
    const tree = parser.parse(code);
    function findSchema(node: any): any {
      if (node.type === 'schema_statement') return node;
      for (let i = 0; i < node.childCount; i++) {
        const found = findSchema(node.child(i)!);
        if (found) return found;
      }
      return null;
    }
    const schemaNode = tree ? findSchema(tree.rootNode) : null;
    if (schemaNode) {
      console.log(`Schema node: lines ${schemaNode.startPosition.row + 1}-${schemaNode.endPosition.row + 1}`);
      // Try to find json_content child
      for (let i = 0; i < schemaNode.childCount; i++) {
        const child = schemaNode.child(i)!;
        console.log(`  Child ${i}: type="${child.type}" (${child.startPosition.row + 1}-${child.endPosition.row + 1})`);
        if (child.type === 'json_content' || child.type === 'raw_text') {
          const jsonText = code.slice(child.startIndex, child.endIndex).trim();
          try {
            const schema = JSON.parse(jsonText);
            const settings = schema.settings?.length ?? 0;
            const blocks = schema.blocks?.length ?? 0;
            console.log(`  Parsed schema: ${settings} settings, ${blocks} blocks, name="${schema.name ?? '?'}"`);
          } catch (e) {
            console.log(`  JSON parse failed: ${(e as Error).message}`);
            console.log(`  First 200 chars: ${jsonText.slice(0, 200)}`);
          }
        }
      }
    } else {
      console.log('No schema_statement found');
    }
  }
}

test().catch(console.error);
