/**
 * Supabase client helper for design_components table.
 * Same service-role pattern as the rest of the design-tokens module.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js';

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
