import fs from 'fs';
import path from 'path';
import { createClient } from '@/lib/supabase/server';

export interface BuiltinTemplate {
  title: string;
  category: string;
  tags: string[];
  variables: Array<{ name: string; type: string }>;
  content: string;
}

export async function seedBuiltinTemplates(): Promise<number> {
  const supabase = await createClient();
  const filePath = path.join(process.cwd(), 'data', 'builtin-templates.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const templates = JSON.parse(raw) as BuiltinTemplate[];

  const { error } = await supabase.from('templates').insert(
    templates.map((template) => ({
      workspace_id: null,
      title: template.title,
      category: template.category,
      tags: template.tags,
      variables: template.variables,
      content: template.content,
    }))
  );

  if (error) {
    throw new Error(`Failed to seed templates: ${error.message}`);
  }

  return templates.length;
}
