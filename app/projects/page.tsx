'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/hooks/useProjects';

/**
 * /projects — Lightweight fallback route.
 *
 * If the user has a recent/first project, redirect straight into the IDE.
 * If not, offer a single action to create one and enter the IDE.
 */
export default function ProjectsPage() {
  const router = useRouter();
  const { projects, isLoading, createProject, isCreating, getLastProjectId } =
    useProjects();
  const [error, setError] = useState<string | null>(null);
  const [redirecting] = useState(false);

  // Auto-redirect to last-opened or first project
  useEffect(() => {
    if (isLoading || redirecting) return;

    const lastId = getLastProjectId();
    if (lastId && projects.some((p) => p.id === lastId)) {
      // Use ref-style guard to avoid cascading setState
      router.replace(`/projects/${lastId}`);
      return;
    }

    if (projects.length > 0) {
      router.replace(`/projects/${projects[0].id}`);
    }
  }, [isLoading, projects, getLastProjectId, router, redirecting]);

  const handleCreate = async () => {
    setError(null);
    try {
      const result = await createProject({ name: 'Untitled project' });
      router.push(`/projects/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  // While loading or redirecting, show a minimal spinner
  if (isLoading || redirecting) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg
            className="animate-spin h-5 w-5"
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
          <span className="text-sm">Loading projects...</span>
        </div>
      </div>
    );
  }

  // No projects — show minimal CTA
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
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
          Create an untitled project to start editing Shopify themes in the IDE.
        </p>
        {error && (
          <p className="text-red-400 text-sm mb-4" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}
