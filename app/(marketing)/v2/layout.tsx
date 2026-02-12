import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Synapse — AI-Powered Shopify Theme IDE for Liquid Developers',
  description:
    'Ship Shopify themes in hours, not weeks. AI-powered Liquid completions, performance scoring, accessibility checks, and one-click deploy. Free for solo developers.',
  keywords: [
    'Shopify theme IDE',
    'AI Shopify development',
    'Shopify theme editor',
    'Liquid code editor',
    'Shopify theme builder',
    'AI code generation Shopify',
    'Shopify development tools',
    'Liquid completions',
    'Shopify theme deploy',
    'Shopify Online Store 2.0',
    'Shopify section schema',
  ],
  authors: [{ name: 'Synapse' }],
  creator: 'Synapse',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://synapse.dev/v2',
    siteName: 'Synapse',
    title: 'Synapse — AI-Powered Shopify Theme IDE',
    description:
      'Ship Shopify themes in hours, not weeks. AI code generation, Liquid intelligence, and one-click deploy.',
    images: [
      {
        url: 'https://synapse.dev/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Synapse IDE — AI-powered Shopify theme development',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Synapse — AI-Powered Shopify Theme IDE',
    description: 'Ship Shopify themes in hours, not weeks.',
    images: ['https://synapse.dev/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://synapse.dev/v2' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Synapse',
      description:
        'AI-powered Shopify theme IDE with Liquid intelligence, multi-agent code generation, performance scoring, and one-click deploy.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      url: 'https://synapse.dev',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free for solo developers',
      },
    },
    {
      '@type': 'Organization',
      name: 'Synapse',
      url: 'https://synapse.dev',
      logo: 'https://synapse.dev/logo.svg',
    },
  ],
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
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
