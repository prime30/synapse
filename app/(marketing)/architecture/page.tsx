import fs from 'fs';
import path from 'path';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isAdmin, getUserFromSession } from '@/lib/auth/session';
import { ArchitecturePageClient } from './client';

export const metadata: Metadata = {
  title: 'AI Architecture | Synapse',
  description:
    "How Synapse's multi-agent AI system works — providers, model routing, orchestration, tools, and streaming pipeline.",
  openGraph: {
    title: 'AI Architecture | Synapse',
    description: "Deep dive into Synapse's multi-agent AI architecture.",
    type: 'article',
    siteName: 'Synapse',
  },
};

export default async function ArchitecturePage() {
  // Require authentication
  const user = await getUserFromSession();
  if (!user) {
    redirect('/auth/signin?callbackUrl=/architecture');
  }

  // Require admin
  const admin = await isAdmin();
  if (!admin) {
    redirect('/docs');
  }

  let content: string;
  try {
    content = fs.readFileSync(
      path.join(process.cwd(), 'ARCHITECTURE.md'),
      'utf-8',
    );
  } catch {
    content = '# Architecture\n\nDocumentation not found.';
  }

  return <ArchitecturePageClient content={content} />;
}
