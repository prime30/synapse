import type { MetadataRoute } from 'next';

/**
 * robots.txt for crawlers.
 * AI-oriented hints (description, key URLs, citation text) are at /ai.txt
 * for agents that support it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/projects/'],
      },
    ],
    sitemap: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://synapse.shop').replace(/\/$/, '')}/sitemap.xml`,
  };
}
