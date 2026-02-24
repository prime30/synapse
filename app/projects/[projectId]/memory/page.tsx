'use client';

import { useParams } from 'next/navigation';
import { MemoryDashboard } from '@/components/memory/MemoryDashboard';

export default function MemoryPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';

  if (!projectId) {
    return (
      <div className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] p-6 flex items-center justify-center">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return <MemoryDashboard projectId={projectId} />;
}
