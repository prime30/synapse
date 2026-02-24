import type { Metadata } from 'next';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';
import { DownloadHero } from './DownloadHero';

export const metadata: Metadata = {
  title: 'Download Synapse Desktop — Native App for Windows, macOS & Linux',
  description:
    'Download the Synapse desktop app. A native experience with offline mode, local file access, and instant startup. Available for Windows, macOS, and Linux.',
  openGraph: {
    title: 'Download Synapse Desktop',
    description:
      'The Synapse editor as a native desktop app. Offline mode, local file access, auto-updates.',
    url: 'https://synapse.so/download',
    siteName: 'Synapse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download Synapse Desktop',
    description:
      'The Synapse editor as a native desktop app. Offline mode, local file access, auto-updates.',
  },
  alternates: {
    canonical: 'https://synapse.so/download',
  },
};

export default function DownloadPage() {
  return (
    <>
      <Navbar />
      <main className="relative z-10 bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] film-grain">
        <DownloadHero />
        <Footer />
      </main>
    </>
  );
}
