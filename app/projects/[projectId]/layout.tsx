import { DesignScanProvider } from '@/contexts/DesignScanContext';

/**
 * Project-level layout.
 *
 * Wraps all pages under /projects/[projectId] with providers whose state
 * must survive client-side navigation between pages (e.g. IDE <-> Design System).
 *
 * The DesignScanProvider keeps the theme scan alive in the background so
 * users can navigate away from the Design System page without aborting it.
 */
export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DesignScanProvider>{children}</DesignScanProvider>;
}
