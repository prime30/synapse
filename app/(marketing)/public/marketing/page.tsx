import { StorefrontMockup } from '@/components/marketing/mockups/StorefrontMockup';

export const metadata = {
  title: 'Marketing assets | Synapse',
  description: 'Generated store mock (Nano Banana Pro / Veo 3.1)',
};

/**
 * Page to view generated marketing assets (store mock).
 * URL: /public/marketing
 * Assets: public/marketing/store/*.png, public/marketing/hero/*.png, hero-loop.mp4
 */
export default function PublicMarketingPage() {
  return (
    <main className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        <h1 className="text-2xl font-medium text-stone-900 dark:text-white mb-2">
          Generated marketing assets
        </h1>
        <p className="text-stone-500 dark:text-white/50 text-sm mb-10">
          Store mock using images/video from{' '}
          <code className="text-stone-600 dark:text-white/60">public/marketing/</code>. Fallbacks to
          Unsplash if files are missing.
        </p>
        <StorefrontMockup />
      </div>
    </main>
  );
}
