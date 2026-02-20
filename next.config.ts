import type { NextConfig } from "next";
import path from 'path';
import type { Configuration } from 'webpack';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  reactCompiler: true,
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core', 'node-cron'],
  webpack: (config: Configuration, { isServer, dev }) => {
    // Persistent filesystem cache — prevents 15-25s recompile on every cold route hit.
    if (dev) {
      config.cache = {
        type: 'filesystem',
        cacheDirectory: path.join(__dirname, '.next', 'cache', 'webpack'),
      };
    }

    // Ignore runtime/cache/theme dirs so background sync activity never triggers dev reloads.
    const root = path.posix.join(__dirname.replace(/\\/g, '/'));
    const ignoreDirs = [
      path.posix.join(root, 'theme-workspace'),
      path.posix.join(root, '.synapse-themes'),
      path.posix.join(root, '.cache'),
      path.posix.join(root, '.next'),
      path.posix.join(root, 'lib', 'benchmarks'),
      path.posix.join(root, 'tests', 'integration', 'results'),
      path.posix.join(root, '.cursor'),
      path.posix.join(root, 'theme-workspace-cursor'),
      path.posix.join(root, 'theme-workspace-cursor-2'),
      path.posix.join(root, 'theme-workspace-cursor-3'),
    ];
    const ignoreGlobs = [
      '**/.synapse-themes/**',
      '**/.cache/**',
      '**/theme-workspace*/**',
      '**/.cursor/**',
      '**/tests/integration/results/**',
    ];
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', ...ignoreGlobs, ...ignoreDirs],
    };
    if (config.plugins && Array.isArray(config.plugins)) {
      const WatchIgnorePlugin = require('webpack').WatchIgnorePlugin;
      config.plugins.push(new WatchIgnorePlugin({ paths: ignoreDirs }));
    }
    if (isServer) {
      // Externalize all node:* requests so instrumentation (file-watcher, chokidar, readdirp, etc.) don't trigger "Unhandled scheme"
      if (Array.isArray(config.externals)) {
        config.externals.push((ctx: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          const req = ctx.request;
          if (typeof req === 'string' && (req.startsWith('node:') || ['fs', 'path', 'os', 'crypto', 'stream', 'events', 'fs/promises', 'child_process'].includes(req))) {
            return callback(null, 'commonjs ' + req);
          }
          callback();
        });
      }
    } else {
      const cacheStub = path.join(__dirname, 'lib', 'cache', 'local-file-cache.client.ts');
      const watcherStub = path.join(__dirname, 'lib', 'sync', 'file-watcher.client.ts');
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/lib/cache/local-file-cache': cacheStub,
        '@/lib/sync/file-watcher': watcherStub,
        // Force a single yjs instance to prevent "Yjs was already imported" runtime errors
        // which cause Fast Refresh full reloads.
        yjs: path.resolve(__dirname, 'node_modules/yjs'),
        'y-protocols': path.resolve(__dirname, 'node_modules/y-protocols'),
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        'fs/promises': false,
        crypto: false,
        'node:fs': false,
        'node:path': false,
        'node:os': false,
        'node:fs/promises': false,
        'node:crypto': false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/.well-known/shopify/monorail/unstable/produce_batch',
        destination: '/api/shopify-monorail-stub',
      },
      {
        source: '/.well-known/shopify/monorail/v1/produce',
        destination: '/api/shopify-monorail-stub',
      },
    ];
  },
};

export default nextConfig;
