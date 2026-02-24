import { Metadata } from 'next';
import { PolicyTemplateLibrary } from '@/components/marketing/sections/PolicyTemplateLibrary';

export const metadata: Metadata = {
  title: 'Shopify Policy Page Templates | Synapse',
  description:
    'Free, clean HTML policy templates for Shopify stores. Copy and paste into your policy editor. Return, privacy, terms, shipping, and contact templates.',
};

export default function PolicyTemplatesPage() {
  return (
    <main className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)]">
      <PolicyTemplateLibrary />
    </main>
  );
}
