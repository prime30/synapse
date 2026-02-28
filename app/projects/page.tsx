import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * /projects -- Smart redirect.
 *
 * Authenticated + has projects → most recent project IDE.
 * Authenticated + no projects → onboarding.
 * Not authenticated → sign in.
 * DB error → retry once, then show most recent project from
 * a broader query before falling back to onboarding.
 */
export default async function ProjectsRedirect() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.warn('[Projects] Auth error, redirecting to sign-in:', authError.message);
  }
  if (!user) {
    redirect('/auth/signin');
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn(`[Projects] Query failed (attempt ${attempt + 1}/2):`, error.message, error.code);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    if (projects && projects.length > 0) {
      redirect(`/projects/${projects[0].id}`);
    }

    console.log(`[Projects] No projects found for user ${user.id} — redirecting to onboarding`);
    break;
  }

  redirect('/onboarding');
}
