import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agent Benchmarks — Performance Comparison | Synapse',
  description:
    'Head-to-head performance benchmarks comparing Synapse AI agents (Sonnet & Opus) against an unorchestrated baseline across Ask, Code, and Debug scenarios on real Shopify theme files.',
  keywords: [
    'AI agent benchmarks',
    'Shopify AI performance',
    'Claude Sonnet vs Opus',
    'AI code generation speed',
    'Synapse benchmarks',
    'AI agent comparison',
    'Shopify theme development',
    'AI developer tools',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://synapse.shop/benchmarks',
    siteName: 'Synapse',
    title: 'AI Agent Benchmarks — Synapse',
    description:
      'Compare Synapse orchestrated agents vs. raw LLM calls across real Shopify development scenarios.',
    images: [
      {
        url: 'https://synapse.shop/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Synapse AI Agent Performance Benchmarks',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Agent Benchmarks — Synapse',
    description:
      'Head-to-head: Synapse orchestrated agents vs. raw LLM calls on real Shopify theme tasks.',
    images: ['https://synapse.shop/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://synapse.shop/benchmarks' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Synapse AI Agent Performance Benchmarks',
  description:
    'Performance comparison of AI coding agents across Ask, Code, and Debug scenarios on Shopify Liquid theme files.',
  creator: {
    '@type': 'Organization',
    name: 'Synapse',
    url: 'https://synapse.shop',
  },
  datePublished: '2026-02-17',
  license: 'https://synapse.shop/terms',
};

export default function BenchmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
