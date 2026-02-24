import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * /projects -- Smart redirect.
 *
 * If the user has projects, go straight to the most recent one.
 * If not, go to onboarding.
 */
export default async function ProjectsRedirect() {
  let targetUrl = '/onboarding';

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (projects && projects.length > 0) {
        targetUrl = `/projects/${projects[0].id}`;
      }
    }
  } catch {
    // Auth or DB error — fall through to onboarding
  }

  redirect(targetUrl);
}
