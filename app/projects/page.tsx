'use client';

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProjects } from '@/hooks/useProjects';
import { LoginTransition } from '@/components/features/auth/LoginTransition';

/**
 * Inner content that uses useSearchParams — must be inside Suspense for static export.
 */
function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createProject, isCreating, getLastProjectId } = useProjects();
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const signedIn = searchParams.get('signed_in') === '1';
  const signedInSuffix = signedIn ? '?signed_in=1' : '';

  const handleCreate = useCallback(async () => {
    setError(null);
    try {
      const result = await createProject({ name: 'Untitled project' });
      router.push(`/projects/${result.id}${signedInSuffix}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create project',
      );
    }
  }, [createProject, router, signedInSuffix]);

  const handleOpen = useCallback(async () => {
    setError(null);
    setIsOpening(true);
    try {
      // Check localStorage first for instant redirect
      const lastId = getLastProjectId();
      if (lastId) {
        router.push(`/projects/${lastId}${signedInSuffix}`);
        return;
      }

      // Fetch projects from server
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to load projects');
      const json = await res.json();
      const projects = (json.data ?? []) as { id: string }[];

      if (projects.length > 0) {
        router.push(`/projects/${projects[0].id}${signedInSuffix}`);
      } else {
        setError('No existing projects found. Create one to get started.');
        setIsOpening(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load projects',
      );
      setIsOpening(false);
    }
  }, [getLastProjectId, router, signedInSuffix]);

  const busy = isCreating || isOpening;

  return (
    <>
      <Suspense fallback={null}>
        <LoginTransition />
      </Suspense>

      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm">
          {/* Icon */}
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-white mb-2">
            Welcome to Synapse
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            Create a new project or open an existing one to start editing
            Shopify themes.
          </p>

          {error && (
            <p className="text-red-400 text-sm mb-4" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="inline-flex items-center justify-center px-6 py-2.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>

            <button
              type="button"
              onClick={handleOpen}
              disabled={busy}
              className="inline-flex items-center justify-center px-6 py-2.5 bg-transparent border border-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-800 hover:border-gray-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isOpening ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Opening...
                </span>
              ) : (
                'Open Existing Project'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * /projects — Landing page after login.
 *
 * Renders instantly with two actions:
 *  1. Create Project — creates a new project and enters the IDE.
 *  2. Open Project — fetches existing projects and redirects to the most recent.
 */
export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <div className="text-center text-gray-400 text-sm">Loading...</div>
      </div>
    }>
      <ProjectsPageContent />
    </Suspense>
  );
}
