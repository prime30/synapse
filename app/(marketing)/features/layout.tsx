import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features — AI-Powered Shopify Theme IDE | Synapse',
  description:
    'Explore Synapse features: AI code generation, Liquid completions, performance scoring, accessibility checks, template composer, asset browser, and one-click deploy.',
  keywords: [
    'Shopify theme IDE features',
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
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://synapse.shop/features',
    siteName: 'Synapse',
    title: 'Features — AI-Powered Shopify Theme IDE | Synapse',
    description:
      'AI code generation, Liquid intelligence, performance scoring, and one-click deploy for Shopify theme developers.',
    images: [
      {
        url: 'https://synapse.shop/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Synapse IDE Features — AI-powered Shopify theme development',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features — Synapse Shopify Theme IDE',
    description:
      'AI code generation, Liquid intelligence, performance scoring, and one-click deploy.',
    images: ['https://synapse.shop/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://synapse.shop/features' },
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
      url: 'https://synapse.shop',
      featureList: [
        'AI code generation with 5 specialist agents',
        'Object-aware Liquid completions for 40+ Shopify objects',
        'Live preview with locale toggle and viewport presets',
        'Template composer with drag-and-drop section reordering',
        'Asset browser with upload and Liquid reference insertion',
        'Performance scoring (0-100) with category breakdown',
        'Accessibility scanner with 8 built-in rules',
        'Image optimization detection and recommendations',
        'Two-tier deploy pre-flight with AI review',
        'Role-based deploy approval for teams',
        'Metafield CRUD with 16 type-aware form inputs',
        'Inline code comments with threaded replies',
        'Spatial canvas for dependency visualization',
        'Offline fallback with local change queue',
      ],
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
      url: 'https://synapse.shop',
      logo: 'https://synapse.shop/logo.svg',
    },
  ],
};

export default function FeaturesLayout({
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
