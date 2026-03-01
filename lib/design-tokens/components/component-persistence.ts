/**
 * Supabase client helper for design_components table.
 * Same service-role pattern as the rest of the design-tokens module.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { DesignComponentRow } from '../models/token-model';

export async function getClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  const { createClient } = await import('@/lib/supabase/server');
  return createClient();
}

export async function listComponentsByProject(
  projectId: string,
): Promise<DesignComponentRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_components')
    .select('*')
    .eq('project_id', projectId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DesignComponentRow[];
}
