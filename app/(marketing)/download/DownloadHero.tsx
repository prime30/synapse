'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Download,
  Monitor,
  Apple,
  Terminal,
  Zap,
  WifiOff,
  RefreshCw,
  Shield,
  HardDrive,
  Cpu,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { usePageReady } from '@/components/marketing/PreloaderContext';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { DesktopAppMockup } from '@/components/marketing/mockups/DesktopAppMockup';
import type { LatestRelease, ReleaseAsset } from '@/lib/releases/github';
import { formatBytes } from '@/lib/releases/github';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const GITHUB_RELEASES_URL = 'https://github.com/prime30/synapse/releases';
const APP_URL = 'https://synapse.shop';
const EASE = [0.22, 1, 0.36, 1] as const;

type Platform = 'windows' | 'mac' | 'linux' | null;

interface PlatformMeta {
  label: string;
  icon: typeof Monitor;
  getPrimary: (r: LatestRelease) => ReleaseAsset | null;
  getSecondary: (r: LatestRelease) => ReleaseAsset | null;
  primaryFormat: string;
  secondaryFormat: string;
  requirements: string[];
}

const PLATFORMS: Record<Exclude<Platform, null>, PlatformMeta> = {
  windows: {
    label: 'Windows',
    icon: Monitor,
    getPrimary: (r) => r.platforms.windows.installer,
    getSecondary: (r) => r.platforms.windows.portable,
    primaryFormat: '.exe Installer',
    secondaryFormat: 'Portable .exe',
    requirements: ['Windows 10 or later', '64-bit (x64)', '4 GB RAM minimum'],
  },
  mac: {
    label: 'macOS',
    icon: Apple,
    getPrimary: (r) => r.platforms.mac.dmg,
    getSecondary: (r) => r.platforms.mac.zip_arm64,
    primaryFormat: '.dmg (Universal)',
    secondaryFormat: 'Apple Silicon .zip',
    requirements: ['macOS 12 Monterey or later', 'Apple Silicon or Intel', '4 GB RAM minimum'],
  },
  linux: {
    label: 'Linux',
    icon: Terminal,
    getPrimary: (r) => r.platforms.linux.appimage,
    getSecondary: (r) => r.platforms.linux.deb,
    primaryFormat: '.AppImage',
    secondaryFormat: 'Debian .deb',
    requirements: ['Ubuntu 20.04+ / Fedora 36+', '64-bit (x64)', '4 GB RAM minimum'],
  },
};

const FEATURES = [
  {
    icon: Zap,
    title: 'Native performance',
    description: 'Direct system access with hardware-accelerated rendering. No browser overhead.',
  },
  {
    icon: WifiOff,
    title: 'Offline-ready',
    description: 'Work on themes without an internet connection. Changes sync when you reconnect.',
  },
  {
    icon: RefreshCw,
    title: 'Auto updates',
    description: 'New versions appear as an in-app prompt with a changelog. Install when ready.',
  },
  {
    icon: Shield,
    title: 'Secure by default',
    description: 'Sandboxed processes, code signing, and encrypted local storage out of the box.',
  },
  {
    icon: HardDrive,
    title: 'Local file access',
    description: 'Open theme folders directly from your filesystem. Drag-and-drop project import.',
  },
  {
    icon: Cpu,
    title: 'System integration',
    description: 'Native notifications, system tray, keyboard shortcuts, and deep OS integration.',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent.toLowerCase();
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase() ?? '';
  if (platform.includes('win') || ua.includes('win')) return 'windows';
  if (platform.includes('mac') || ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PlatformCard({
  id,
  meta,
  release,
  isDetected,
  delay,
}: {
  id: Exclude<Platform, null>;
  meta: PlatformMeta;
  release: LatestRelease | null;
  isDetected: boolean;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-40px' });
  const Icon = meta.icon;

  const primary = release ? meta.getPrimary(release) : null;
  const secondary = release ? meta.getSecondary(release) : null;
  const href = primary?.url ?? GITHUB_RELEASES_URL;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={`group relative flex flex-col rounded-2xl border p-6 transition-all hover:shadow-xl hover:-translate-y-1 ${
        isDetected
          ? 'border-accent/30 bg-accent/[0.03] dark:bg-accent/[0.04] ring-1 ring-accent/20'
          : 'border-stone-200 dark:border-white/10 bg-white dark:bg-white/[0.02]'
      }`}
    >
      {isDetected && (
        <span className="absolute top-3.5 right-3.5 flex items-center gap-1 rounded-full bg-accent/10 dark:bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Your OS
        </span>
      )}

      <div
        className={`mb-5 inline-flex items-center justify-center rounded-xl p-3 ${
          isDetected
            ? 'bg-accent/10 text-accent'
            : 'bg-stone-100 dark:bg-white/5 text-stone-400 dark:text-white/30 group-hover:text-stone-600 dark:group-hover:text-white/50'
        } transition-colors`}
      >
        <Icon size={26} />
      </div>

      <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-1">{meta.label}</h3>

      {/* Formats */}
      <div className="mt-1 space-y-0.5 mb-4">
        <p className="text-sm text-stone-500 dark:text-white/40">
          {primary?.name ?? meta.primaryFormat}
        </p>
        {secondary && (
          <p className="text-sm text-stone-400 dark:text-white/25">{secondary.name}</p>
        )}
      </div>

      {/* Requirements */}
      <ul className="mt-auto space-y-1">
        {meta.requirements.map((req) => (
          <li
            key={req}
            className="text-[12px] text-stone-400 dark:text-white/25 flex items-start gap-1.5"
          >
            <span className="mt-1 w-1 h-1 rounded-full bg-stone-300 dark:bg-white/15 shrink-0" />
            {req}
          </li>
        ))}
      </ul>

      {/* Primary download action */}
      <a
        href={href}
        target={primary ? undefined : '_blank'}
        rel={primary ? undefined : 'noopener noreferrer'}
        className="mt-5 flex items-center gap-2 text-sm font-medium text-accent translate-y-0 opacity-70 group-hover:opacity-100 transition-all"
      >
        {primary ? <Download size={15} /> : <ExternalLink size={15} />}
        {primary
          ? `Download ${meta.primaryFormat}`
          : 'View on GitHub'}
      </a>

      {/* Secondary download */}
      {secondary && (
        <a
          href={secondary.url}
          className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-400 dark:text-white/25 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Download size={12} />
          {secondary.name}
          {secondary.size > 0 && (
            <span className="text-stone-300 dark:text-white/15">
              ({formatBytes(secondary.size)})
            </span>
          )}
        </a>
      )}
    </motion.div>
  );
}

function FeatureCard({
  feature,
  delay,
}: {
  feature: (typeof FEATURES)[number];
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-40px' });
  const Icon = feature.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className="group"
    >
      <div className="mb-3 inline-flex items-center justify-center rounded-lg p-2 bg-stone-100 dark:bg-white/5 text-stone-400 dark:text-white/30 group-hover:text-accent group-hover:bg-accent/10 transition-colors">
        <Icon size={18} />
      </div>
      <h4 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
        {feature.title}
      </h4>
      <p className="text-sm text-stone-500 dark:text-white/40 leading-relaxed">
        {feature.description}
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DownloadHero({ release }: { release: LatestRelease | null }) {
  const ready = usePageReady();
  const [detected, setDetected] = useState<Platform>(null);
  const featureRef = useRef<HTMLDivElement>(null);
  const featureInView = useInView(featureRef, { once: false, margin: '-60px' });

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  const version = release?.version ?? null;
  const primary = detected ? PLATFORMS[detected] : null;
  const primaryAsset = release && detected ? primary?.getPrimary(release) ?? null : null;
  const otherPlatforms = (['windows', 'mac', 'linux'] as const).filter((p) => p !== detected);

  return (
    <>
      {/* ── Hero Section ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Grid divider rails */}
        <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden>
          <div className="relative h-full">
            <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
          </div>
        </div>

        {/* Gradient backdrop */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[700px] w-[900px] rounded-full bg-gradient-to-b from-accent/20 via-accent/5 to-transparent blur-3xl opacity-60 dark:opacity-30" />
        </div>

        <div className="relative max-w-6xl mx-auto px-8 md:px-10 pt-28 sm:pt-32 pb-8">
          {/* Badge */}
          <motion.div
            className="flex justify-center mb-7"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-1.5 text-xs font-medium text-stone-500 dark:text-white/40 backdrop-blur-sm">
              <Download size={12} />
              {version ? `Desktop App — v${version}` : 'Desktop App'}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="text-center text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] text-stone-900 dark:text-white leading-[1.1]"
            initial={{ opacity: 0, y: 24 }}
            animate={ready ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
          >
            Synapse on your{' '}
            <PixelAccent delay={0.4}>desktop</PixelAccent>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            className="mt-5 text-center text-lg sm:text-xl text-stone-500 dark:text-white/50 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={ready ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.25, ease: EASE }}
          >
            A native app with full local file access, offline mode, and instant
            startup. The same powerful editor — without the browser.
          </motion.p>

          {/* Primary CTA */}
          <motion.div
            className="mt-10 flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={ready ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.35, ease: EASE }}
          >
            {primaryAsset && primary ? (
              <>
                <MagneticElement strength={6} radius={120}>
                  <a
                    href={primaryAsset.url}
                    className="inline-flex items-center gap-2.5 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 hover:bg-accent-hover hover:shadow-accent/30 transition-all"
                  >
                    <Download size={18} strokeWidth={2.5} />
                    Download for {primary.label}
                  </a>
                </MagneticElement>

                <div className="flex items-center gap-4 text-sm text-stone-400 dark:text-white/30">
                  <span>{primary.primaryFormat}</span>
                  <span className="w-px h-3 bg-stone-200 dark:bg-white/10" />
                  <span>v{version}</span>
                  {primaryAsset.size > 0 && (
                    <>
                      <span className="w-px h-3 bg-stone-200 dark:bg-white/10" />
                      <span>{formatBytes(primaryAsset.size)}</span>
                    </>
                  )}
                </div>

                <p className="mt-1 text-sm text-stone-400 dark:text-white/25">
                  Also available for{' '}
                  {otherPlatforms.map((p, i) => (
                    <span key={p}>
                      <a
                        href="#platforms"
                        className="underline underline-offset-2 hover:text-stone-600 dark:hover:text-white/40 transition-colors"
                      >
                        {PLATFORMS[p].label}
                      </a>
                      {i < otherPlatforms.length - 1 ? ' and ' : ''}
                    </span>
                  ))}
                </p>
              </>
            ) : (
              /* No release yet — link to GitHub */
              <a
                href={release?.releaseUrl ?? GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 hover:bg-accent-hover transition-all"
              >
                <ExternalLink size={18} strokeWidth={2.5} />
                {release ? `View Release v${release.version}` : 'View all releases'}
              </a>
            )}
          </motion.div>
        </div>

        {/* Desktop Mockup */}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-8 pt-8 pb-16">
          <DesktopAppMockup />
        </div>
      </section>

      {/* ── Features Section ───────────────────────────────────────── */}
      <section className="relative border-t border-stone-200 dark:border-white/5">
        <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden>
          <div className="relative h-full">
            <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
          </div>
        </div>

        <div ref={featureRef} className="relative max-w-6xl mx-auto px-8 md:px-10 py-20 md:py-28">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 20 }}
            animate={featureInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-stone-900 dark:text-white">
              Built for your workflow
            </h2>
            <p className="mt-3 text-stone-500 dark:text-white/50 text-lg max-w-lg mx-auto">
              Everything you get in the browser, plus native capabilities that make development
              faster.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
            {FEATURES.map((feature, i) => (
              <FeatureCard key={feature.title} feature={feature} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Cards Section ─────────────────────────────────── */}
      <section
        id="platforms"
        className="relative border-t border-stone-200 dark:border-white/5 scroll-mt-20"
      >
        <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden>
          <div className="relative h-full">
            <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto px-8 md:px-10 py-20 md:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-stone-900 dark:text-white">
              All platforms
            </h2>
            <p className="mt-3 text-stone-500 dark:text-white/50 text-lg">
              Available for Windows, macOS, and Linux.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {(['windows', 'mac', 'linux'] as const).map((id, i) => (
              <PlatformCard
                key={id}
                id={id}
                meta={PLATFORMS[id]}
                release={release}
                isDetected={detected === id}
                delay={i * 0.1}
              />
            ))}
          </div>

          {/* Alternative downloads */}
          <div className="mt-10 text-center">
            <p className="text-sm text-stone-400 dark:text-white/25">
              Need a different format?{' '}
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-stone-600 dark:hover:text-white/40 transition-colors"
              >
                View all releases on GitHub
              </a>
              {' · '}
              <Link
                href="/changelog"
                className="underline underline-offset-2 hover:text-stone-600 dark:hover:text-white/40 transition-colors"
              >
                Changelog
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Legal / System Requirements Footer ─────────────────────── */}
      <section className="relative border-t border-stone-200 dark:border-white/5">
        <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden>
          <div className="relative h-full">
            <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto px-8 md:px-10 py-12 text-center">
          <p className="text-xs text-stone-400 dark:text-white/25 max-w-lg mx-auto leading-relaxed">
            Synapse Desktop requires a 64-bit operating system. Windows 10+, macOS 12+, or Ubuntu
            20.04+ recommended. Updates are opt-in — you choose when to install.{' '}
            <Link
              href="/terms"
              className="underline underline-offset-2 hover:text-stone-500 dark:hover:text-white/40 transition-colors"
            >
              Terms of Service
            </Link>
            {' · '}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-stone-500 dark:hover:text-white/40 transition-colors"
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
