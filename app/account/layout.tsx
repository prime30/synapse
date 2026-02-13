import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AccountSidebar } from '@/components/account/AccountSidebar';

export const metadata = {
  title: 'Account – Synapse',
  description: 'Manage your Synapse account, billing, and integrations.',
};

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/signin');

  // Fetch profile — may not exist yet for new users
  let profile: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = data;
  } catch {
    // Profile table may not exist yet
  }

  // Subscription may not exist yet
  let subscription: Record<string, unknown> | null = null;
  try {
    const orgId =
      (profile as Record<string, unknown> | null)?.organization_id ?? '';
    if (orgId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organization_id', orgId)
        .single();
      subscription = data;
    }
  } catch {
    // Subscription table may not exist yet
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AccountSidebar
        user={{
          email: user.email ?? '',
          name:
            (profile as Record<string, unknown> | null)?.display_name as string ??
            user.email ??
            '',
        }}
        plan={
          (subscription as Record<string, unknown> | null)?.plan as string ??
          'starter'
        }
      />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
