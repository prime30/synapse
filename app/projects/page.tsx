import { redirect } from 'next/navigation';

/**
 * /projects -- Backward-compatibility redirect.
 *
 * This page used to be a client-side routing hub that checked store/project
 * state and redirected accordingly. That logic now lives in the onboarding
 * wizard's smart entry gate. This server-side redirect ensures bookmarks
 * and external links continue to work.
 */
export default function ProjectsRedirect() {
  redirect('/onboarding');
}
