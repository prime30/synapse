import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function SharedSummaryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('shared_session_summaries')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!data) return notFound();

  return (
    <main className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] flex items-start justify-center py-12 px-4">
      <article className="bg-white dark:bg-[oklch(0.21_0_0)] border border-stone-200 dark:border-white/10 rounded-lg shadow-lg p-6 max-w-3xl w-full">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-stone-900 dark:text-white">
            {data.title || 'Session Summary'}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Shared from Synapse · Expires{' '}
            {new Date(data.expires_at).toLocaleDateString()}
          </p>
        </header>
        <div className="prose prose-sm dark:prose-invert max-w-none text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
          {data.sanitized_content}
        </div>
      </article>
    </main>
  );
}
