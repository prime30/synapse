import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Synapse - AI-Powered Shopify Theme IDE',
    short_name: 'Synapse',
    description: 'AI-powered Shopify theme development platform',
    theme_color: 'oklch(0.745 0.189 148)',
    background_color: 'oklch(0.985 0.001 106)',
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
