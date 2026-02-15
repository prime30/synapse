import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

export const maxDuration = 60;

const TEXT_EXTS = new Set([
  '.liquid', '.json', '.css', '.js', '.ts', '.scss', '.svg', '.txt', '.html', '.md',
]);

const THEME_DIRS = ['layout', 'templates', 'sections', 'snippets', 'config', 'assets'];

function normalizeRepoUrl(url: string): string {
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(url)) {
    return `https://github.com/${url}.git`;
  }
  if (url.startsWith('https://') && !url.endsWith('.git')) {
    return url + '.git';
  }
  return url;
}

function walkDir(dir: string, base: string = ''): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkDir(path.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { repoUrl: rawUrl, branch, projectName } = body as {
      repoUrl?: string;
      branch?: string;
      projectName?: string;
    };

    if (!rawUrl || typeof rawUrl !== 'string') {
      throw APIError.badRequest('repoUrl is required');
    }

    const repoUrl = normalizeRepoUrl(rawUrl.trim());
    if (!repoUrl.startsWith('https://')) {
      throw APIError.badRequest('Only HTTPS repository URLs are supported');
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!member?.organization_id) {
      throw APIError.badRequest('No organization found');
    }

    const tmpDir = path.join(os.tmpdir(), `synapse-git-${crypto.randomUUID()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const git = await import('isomorphic-git');
      const http = await import('isomorphic-git/http/node');

      await git.clone({
        fs,
        http: http.default,
        dir: tmpDir,
        url: repoUrl,
        depth: 1,
        singleBranch: true,
        ref: branch || 'main',
      });

      const allFiles = walkDir(tmpDir);
      let themeRoot = tmpDir;
      const rootDirs = THEME_DIRS.filter((d) =>
        allFiles.some((f) => f.startsWith(`${d}/`))
      );

      if (rootDirs.length < 2) {
        const topDirs = [...new Set(allFiles.map((f) => f.split('/')[0]).filter(Boolean))];
        let found = false;
        for (const dir of topDirs) {
          const nested = THEME_DIRS.filter((d) =>
            allFiles.some((f) => f.startsWith(`${dir}/${d}/`))
          );
          if (nested.length >= 2) {
            themeRoot = path.join(tmpDir, dir);
            found = true;
            break;
          }
        }
        if (!found && rootDirs.length < 2) {
          throw APIError.badRequest(
            'Repository does not contain a valid Shopify theme structure. Expected at least 2 of: layout/, templates/, sections/, snippets/, config/, assets/'
          );
        }
      }

      const repoName = rawUrl.split('/').pop()?.replace(/\.git$/, '') || 'Git Import';
      const name = projectName?.trim() || repoName;

      const { data: project, error: projError } = await supabase
        .from('projects')
        .insert({
          name,
          organization_id: member.organization_id,
          owner_id: userId,
        })
        .select('id, name')
        .single();

      if (projError || !project) {
        throw APIError.internal(projError?.message || 'Failed to create project');
      }

      const themeFiles = walkDir(themeRoot);
      let fileCount = 0;
      const errors: string[] = [];
      const BATCH_SIZE = 50;

      for (let i = 0; i < themeFiles.length; i += BATCH_SIZE) {
        const batch = themeFiles.slice(i, i + BATCH_SIZE);
        const records: { project_id: string; path: string; content: string }[] = [];

        for (const relPath of batch) {
          const fullPath = path.join(themeRoot, relPath);
          try {
            const ext = path.extname(relPath).toLowerCase();
            if (TEXT_EXTS.has(ext)) {
              const content = fs.readFileSync(fullPath, 'utf-8');
              records.push({ project_id: project.id, path: relPath, content });
            } else {
              const buffer = fs.readFileSync(fullPath);
              const storagePath = `${project.id}/${relPath}`;
              await supabase.storage
                .from('project-files')
                .upload(storagePath, buffer, { upsert: true });
              records.push({
                project_id: project.id,
                path: relPath,
                content: `[binary:storage:${storagePath}]`,
              });
            }
          } catch {
            errors.push(relPath);
          }
        }

        if (records.length > 0) {
          const { error: insertError } = await supabase.from('files').insert(records);
          if (insertError) {
            errors.push(`Batch insert error: ${insertError.message}`);
          } else {
            fileCount += records.length;
          }
        }
      }

      return successResponse({
        projectId: project.id,
        projectName: project.name,
        fileCount,
        errors,
      });
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  } catch (error) {
    return handleAPIError(error);
  }
}
