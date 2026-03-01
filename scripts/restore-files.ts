import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const projectId = 'f70d9af0-616a-4723-b231-ada0f2d41d77';
const cacheDir = '.synapse-themes/f70d9af0-copy-of-copy-of-copy-of-swatches-with-nicknames';

const filesToRestore = [
  { dbName: 'product-form-dynamic.js', localPath: join(cacheDir, 'assets', 'product-form-dynamic.js') },
  { dbName: 'product-form-dynamic.css', localPath: join(cacheDir, 'assets', 'product-form-dynamic.css') },
  { dbName: 'product-form-dynamic.liquid', localPath: join(cacheDir, 'snippets', 'product-form-dynamic.liquid') },
];

async function restore() {
  for (const f of filesToRestore) {
    const content = readFileSync(f.localPath, 'utf-8');
    console.log(`Restoring ${f.dbName} (${content.length} chars)...`);

    const { data: fileRow, error: findErr } = await supabase
      .from('files')
      .select('id, name, path')
      .eq('project_id', projectId)
      .eq('name', f.dbName)
      .limit(1)
      .maybeSingle();

    if (findErr) { console.error(`  Find error: ${findErr.message}`); continue; }
    if (!fileRow) { console.error(`  File not found in DB: ${f.dbName}`); continue; }

    const { error: updateErr } = await supabase
      .from('files')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', fileRow.id);

    if (updateErr) { console.error(`  Update error: ${updateErr.message}`); continue; }
    console.log(`  Restored ${fileRow.id} (${fileRow.path ?? fileRow.name})`);
  }
  console.log('Done — refresh the IDE to see restored files.');
}

restore().catch(console.error);
