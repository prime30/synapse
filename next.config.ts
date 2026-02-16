import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  reactCompiler: true,
  serverExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core'],
  async rewrites() {
    return [
      {
        source: '/.well-known/shopify/monorail/unstable/produce_batch',
        destination: '/api/shopify-monorail-stub',
      },
    ];
  },
};

export default nextConfig;
