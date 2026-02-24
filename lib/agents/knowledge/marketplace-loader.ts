/**
 * Marketplace skill loader — loads installed skills from the community marketplace
 * for a given project.
 */

import type { KnowledgeModule } from './module-matcher';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadInstalledMarketplaceSkills(
  projectId: string,
  supabase: SupabaseClient
): Promise<KnowledgeModule[]> {
  const { data, error } = await supabase
    .from('installed_skills')
    .select('skill_id, installed_version, published_skills(name, content, keywords)')
    .eq('project_id', projectId);

  if (error || !data) return [];

  const modules: KnowledgeModule[] = [];
  for (const row of data) {
    const ps = Array.isArray((row as { published_skills?: unknown }).published_skills)
      ? (row as { published_skills: unknown[] }).published_skills[0]
      : (row as { published_skills?: { name?: string; content?: string; keywords?: string[] } }).published_skills;
    if (!ps || typeof ps !== 'object' || !('name' in ps) || !('content' in ps)) continue;
    const p = ps as { name: string; content: string; keywords?: string[] };
    modules.push({
      id: `marketplace:${p.name}`,
      keywords: p.keywords ?? [],
      content: p.content,
      tokenEstimate: Math.ceil((p.content?.length ?? 0) / 4),
    });
  }
  return modules;
}
