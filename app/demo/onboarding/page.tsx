import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DemoOnboardingView } from './DemoOnboardingView';

const ALLOWED_EMAIL = 'alexmaxday@gmail.com';

export default async function DemoOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ALLOWED_EMAIL) {
    redirect('/');
  }

  return <DemoOnboardingView />;
}
