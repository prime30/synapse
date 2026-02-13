import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Synapse - AI-Powered Shopify Theme IDE',
    short_name: 'Synapse',
    description: 'AI-powered Shopify theme development platform',
    theme_color: '#28CD56',
    background_color: '#fafaf9',
    display: 'standalone',
    start_url: '/',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
