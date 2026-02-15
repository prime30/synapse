import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getLastPushSnapshot } from '@/lib/shopify/push-history';
import { generateUnifiedDiff } from '@/lib/versions/diff-generator';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { downloadFromStorage } from '@/lib/storage/files';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FileCategory = 'component' | 'page' | 'layout' | 'asset' | 'config';

interface DevReportFile {
  path: string;
  status: 'added' | 'modified';
  category: FileCategory;
  linesAdded: number;
  linesRemoved: number;
}

interface DevReport {
  summary: {
    totalFiles: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
    componentsAffected: number;
    pagesWorked: number;
  };
  lastPushAt: string | null;
  files: DevReportFile[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    );
  }
  return createServerClient();
}

function categorize(filePath: string): FileCategory {
  if (filePath.startsWith('snippets/') || filePath.startsWith('sections/'))
    return 'component';
  if (filePath.startsWith('templates/')) return 'page';
  if (filePath.startsWith('layout/')) return 'layout';
  if (filePath.startsWith('assets/')) return 'asset';
  return 'config';
}

/* ------------------------------------------------------------------ */
/*  Route params                                                       */
/* ------------------------------------------------------------------ */

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects/[projectId]/dev-report                           */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await adminSupabase();

    // 1. Find the project's connection
    const { data: project } = await supabase
      .from('projects')
      .select('shopify_connection_id')
      .eq('id', projectId)
      .maybeSingle();

    if (!project?.shopify_connection_id) {
      // No Shopify connection — return empty report
      const empty: DevReport = {
        summary: {
          totalFiles: 0,
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
          componentsAffected: 0,
          pagesWorked: 0,
        },
        lastPushAt: null,
        files: [],
      };
      return successResponse(empty);
    }

    // 2. Fetch pending theme_files with their file content
    const { data: pendingFiles } = await supabase
      .from('theme_files')
      .select('file_path')
      .eq('connection_id', project.shopify_connection_id)
      .eq('sync_status', 'pending');

    // 3. Fetch last push snapshot
    const lastPush = await getLastPushSnapshot(projectId);
    const snapshotMap = new Map<string, string>();
    if (lastPush) {
      for (const f of lastPush.snapshot.files) {
        snapshotMap.set(f.path, f.content);
      }
    }

    // 4. Build file-level diff report
    const reportFiles: DevReportFile[] = [];
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const tf of pendingFiles ?? []) {
      // Get current file content
      const { data: file } = await supabase
        .from('files')
        .select('content, storage_path')
        .eq('project_id', projectId)
        .eq('path', tf.file_path)
        .maybeSingle();

      if (!file) continue;

      let currentContent = file.content;
      if (!currentContent && file.storage_path) {
        try {
          currentContent = await downloadFromStorage(file.storage_path);
        } catch {
          continue;
        }
      }
      if (!currentContent || typeof currentContent !== 'string') continue;

      const oldContent = snapshotMap.get(tf.file_path) ?? '';
      const isNew = !snapshotMap.has(tf.file_path);

      const diff = generateUnifiedDiff(oldContent, currentContent);

      reportFiles.push({
        path: tf.file_path,
        status: isNew ? 'added' : 'modified',
        category: categorize(tf.file_path),
        linesAdded: diff.added,
        linesRemoved: diff.removed,
      });

      totalAdded += diff.added;
      totalRemoved += diff.removed;
    }

    // 5. Compute summary counts
    const componentsAffected = reportFiles.filter(
      (f) => f.category === 'component'
    ).length;
    const pagesWorked = reportFiles.filter(
      (f) => f.category === 'page'
    ).length;

    const report: DevReport = {
      summary: {
        totalFiles: reportFiles.length,
        totalLinesAdded: totalAdded,
        totalLinesRemoved: totalRemoved,
        componentsAffected,
        pagesWorked,
      },
      lastPushAt: lastPush?.pushedAt ?? null,
      files: reportFiles,
    };

    return successResponse(report);
  } catch (error) {
    return handleAPIError(error);
  }
}
