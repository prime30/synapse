import { Metadata } from 'next';
import { Suspense } from 'react';
import { PackingSlipDesignerPage } from '@/components/features/packing-slip-designer/PackingSlipDesigner';

export const metadata: Metadata = {
  title: 'Packing Slip Designer | Synapse',
  description: 'Design and customize Shopify packing slip templates with live preview.',
};

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-pulse text-sm text-stone-500 dark:text-[#636059]">Loading packing slip designer...</div>
      </div>
    }>
      <PackingSlipDesignerPage />
    </Suspense>
  );
}
