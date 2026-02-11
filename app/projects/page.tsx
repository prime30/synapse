'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProjects } from '@/hooks/useProjects';
import { useActiveStore } from '@/hooks/useActiveStore';
import { LoginTransition } from '@/components/features/auth/LoginTransition';
import { ImportThemeModal } from '@/components/features/file-management/ImportThemeModal';

// ── Step 1: Connect Store ───────────────────────────────────────────────────

function StoreConnectForm() {
  const { connectStore, isConnecting, connectError } = useActiveStore();
  const [storeDomain, setStoreDomain] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    const domain = storeDomain.trim();
    if (!domain || !adminToken.trim()) return;

    setError(null);
    const fullDomain = domain.includes('.myshopify.com')
      ? domain
      : `${domain}.myshopify.com`;

    try {
      await connectStore({ storeDomain: fullDomain, adminApiToken: adminToken.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
        </svg>
      </div>

      <h1 className="text-xl font-semibold text-white text-center">
        Connect your Shopify store
      </h1>
      <p className="text-sm text-gray-400 text-center">
        Connect a store to start working on your themes.
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="store-domain" className="block text-xs font-medium text-gray-400 mb-1">
            Store domain
          </label>
          <div className="flex gap-0">
            <input
              id="store-domain"
              type="text"
              value={storeDomain}
              onChange={(e) => setStoreDomain(e.target.value.replace(/\.myshopify\.com$/i, ''))}
              placeholder="your-store-name"
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-l bg-gray-800 border border-r-0 border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="inline-flex items-center px-3 py-2 text-sm text-gray-500 bg-gray-800/60 border border-l-0 border-gray-600 rounded-r select-none whitespace-nowrap">
              .myshopify.com
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="admin-token" className="block text-xs font-medium text-gray-400 mb-1">
            Admin API access token
          </label>
          <input
            id="admin-token"
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="shpat_..."
            className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed">
          Create a token in your Shopify admin:{' '}
          <span className="text-gray-400">Settings &rarr; Apps &rarr; Develop apps &rarr; Create app &rarr; Configure Admin API scopes</span>.
          Enable <span className="text-gray-300">read_themes</span> and <span className="text-gray-300">write_themes</span>.
        </p>

        <button
          type="button"
          onClick={handleConnect}
          disabled={!storeDomain.trim() || !adminToken.trim() || isConnecting}
          className="w-full px-4 py-2.5 text-sm rounded bg-white text-gray-900 font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isConnecting ? 'Connecting...' : 'Connect Store'}
        </button>

        {(error || connectError) && (
          <p className="text-red-400 text-sm">{error ?? connectError?.message}</p>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Import Theme (store connected, no projects yet) ─────────────────

function ImportThemePrompt({
  storeDomain,
  projects,
}: {
  storeDomain: string;
  projects: { id: string; name: string; shopify_theme_name?: string | null }[];
}) {
  const router = useRouter();
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <div className="text-center max-w-sm">
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm text-gray-400 font-mono">{storeDomain}</span>
      </div>

      <h1 className="text-xl font-semibold text-white mb-2">
        Import a theme to get started
      </h1>
      <p className="text-sm text-gray-400 mb-6">
        Choose a theme from your store to start working on it.
      </p>

      <button
        type="button"
        onClick={() => setShowImportModal(true)}
        className="inline-flex items-center justify-center px-6 py-2.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
      >
        Import Theme
      </button>

      {projects.length > 0 && (
        <div className="mt-8 space-y-2">
          <p className="text-xs text-gray-500">Or open an existing theme:</p>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => router.push(`/projects/${project.id}`)}
              className="w-full px-4 py-2 text-sm text-left rounded bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors"
            >
              <span className="block font-medium">{project.name}</span>
              {project.shopify_theme_name && (
                <span className="block text-xs text-gray-500 mt-0.5">{project.shopify_theme_name}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <ImportThemeModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
    </div>
  );
}

// ── Skeleton loader ──────────────────────────────────────────────────────────

function ProjectsSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Nav skeleton */}
      <div className="h-14 border-b border-white/5 flex items-center px-6">
        <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
        <div className="ml-auto flex gap-3">
          <div className="h-8 w-20 bg-white/5 rounded-full animate-pulse" />
          <div className="h-8 w-8 bg-white/5 rounded-full animate-pulse" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-16">
        {/* Heading skeleton */}
        <div className="h-7 w-44 bg-white/10 rounded animate-pulse" />
        <div className="h-4 w-64 bg-white/5 rounded animate-pulse mt-3" />

        {/* Card skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page orchestrator ──────────────────────────────────────────────────

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connection, isLoading: storeLoading, error: storeError } = useActiveStore();
  const { projects, isLoading: projectsLoading, getLastProjectId } = useProjects(connection?.id ?? null);
  const didAutoRedirect = useRef(false);
  const signedIn = searchParams.get('signed_in') === '1';
  const signedInSuffix = signedIn ? '?signed_in=1' : '';

  // Auto-redirect when store + projects are ready
  useEffect(() => {
    if (storeLoading || projectsLoading) return;
    if (didAutoRedirect.current) return;
    if (!connection || projects.length === 0) return;

    didAutoRedirect.current = true;
    const lastId = getLastProjectId();
    const validLast = lastId && projects.some((p) => p.id === lastId);
    if (validLast) {
      router.replace(`/projects/${lastId}${signedInSuffix}`);
    } else {
      router.replace(`/projects/${projects[0].id}${signedInSuffix}`);
    }
  }, [storeLoading, projectsLoading, connection, projects, getLastProjectId, router, signedInSuffix]);

  // Still loading store info → show skeleton (but skip if errored)
  if (storeLoading && !storeError) {
    return <ProjectsSkeleton />;
  }

  // Step 1: No active store (or store query failed) → connect form immediately
  if (!connection) {
    return (
      <>
        <Suspense fallback={null}>
          <LoginTransition />
        </Suspense>
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
          <StoreConnectForm />
        </div>
      </>
    );
  }

  // Store loaded, projects still loading → show store info + skeleton cards
  if (projectsLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto px-6 pt-16">
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-400 font-mono">{connection.store_domain}</span>
          </div>
          <div className="h-7 w-52 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-72 bg-white/5 rounded animate-pulse mt-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Store connected → import theme (with project list if any exist)
  // (If projects exist, the useEffect above will auto-redirect)
  return (
    <>
      <Suspense fallback={null}>
        <LoginTransition />
      </Suspense>
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <ImportThemePrompt
          storeDomain={connection.store_domain}
          projects={projects}
        />
      </div>
    </>
  );
}

/**
 * /projects — Landing page after login.
 *
 * Flow:
 *   1. No active store   → StoreConnectForm
 *   2. Store, no projects → ImportThemePrompt (inline modal)
 *   3. Store + projects   → auto-redirect to /projects/[id] (IDE)
 */
export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsPageContent />
    </Suspense>
  );
}
