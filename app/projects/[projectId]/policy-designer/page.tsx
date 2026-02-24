import { Metadata } from 'next';
import { Suspense } from 'react';
import { PolicyDesignerPage } from '@/components/features/policy-designer/PolicyDesigner';

export const metadata: Metadata = {
  title: 'Policy Designer | Synapse',
  description: 'Generate Shopify policy pages styled to match your theme.',
};

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen ide-surface flex items-center justify-center">
        <div className="animate-pulse text-sm ide-text-muted">Loading policy designer...</div>
      </div>
    }>
      <PolicyDesignerPage />
    </Suspense>
  );
}
