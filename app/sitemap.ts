import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://synapse.dev';
  const now = new Date().toISOString();

  const routes = [
    // Core pages
    { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
    { path: '/v2', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/features', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' as const },

    // Content & resources
    { path: '/docs', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/blog', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/examples', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/changelog', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/roadmap', priority: 0.6, changeFrequency: 'monthly' as const },

    // Company
    { path: '/about', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/careers', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/contact', priority: 0.5, changeFrequency: 'monthly' as const },

    // Onboarding
    { path: '/signup', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/welcome', priority: 0.4, changeFrequency: 'monthly' as const },

    // Legal
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/security', priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
