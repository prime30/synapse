'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CodeComment {
  id: string;
  project_id: string;
  file_path: string;
  line_number: number;
  content: string;
  author_id: string;
  author?: { display_name: string; avatar_url: string | null };
  parent_id: string | null;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  replies?: CodeComment[];
}

interface RawComment {
  id: string;
  project_id: string;
  file_path: string;
  line_number: number;
  content: string;
  author_id: string;
  parent_id: string | null;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  profiles: { display_name: string; avatar_url: string | null } | null;
}

/** Nest flat comments into a tree: top-level comments with nested replies. */
function nestComments(flat: CodeComment[]): CodeComment[] {
  const topLevel: CodeComment[] = [];
  const byParent = new Map<string, CodeComment[]>();

  for (const c of flat) {
    if (c.parent_id) {
      const group = byParent.get(c.parent_id) ?? [];
      group.push(c);
      byParent.set(c.parent_id, group);
    } else {
      topLevel.push({ ...c, replies: [] });
    }
  }

  for (const root of topLevel) {
    root.replies = (byParent.get(root.id) ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  return topLevel.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCodeComments(projectId: string, filePath: string | null) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const queryKey = ['code-comments', projectId, filePath];

  // ── Fetch comments ──────────────────────────────────────────────────────

  const commentsQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<CodeComment[]> => {
      const { data, error } = await supabase
        .from('code_comments')
        .select('*, profiles:author_id(display_name, avatar_url)')
        .eq('project_id', projectId)
        .eq('file_path', filePath!)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: CodeComment[] = (data as RawComment[]).map((row) => ({
        id: row.id,
        project_id: row.project_id,
        file_path: row.file_path,
        line_number: row.line_number,
        content: row.content,
        author_id: row.author_id,
        author: row.profiles ?? undefined,
        parent_id: row.parent_id,
        resolved: row.resolved,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      return nestComments(mapped);
    },
    enabled: !!filePath,
  });

  // ── Add comment ─────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async ({
      lineNumber,
      content,
      parentId,
    }: {
      lineNumber: number;
      content: string;
      parentId?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('code_comments')
        .insert({
          project_id: projectId,
          file_path: filePath!,
          line_number: lineNumber,
          content,
          author_id: user.id,
          parent_id: parentId ?? null,
        })
        .select('*, profiles:author_id(display_name, avatar_url)')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Update comment ──────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async ({
      commentId,
      content,
    }: {
      commentId: string;
      content: string;
    }) => {
      const { data, error } = await supabase
        .from('code_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Delete comment ──────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('code_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Resolve / unresolve comment ─────────────────────────────────────────

  const resolveMutation = useMutation({
    mutationFn: async (commentId: string) => {
      // Fetch current state first to toggle
      const { data: current, error: fetchError } = await supabase
        .from('code_comments')
        .select('resolved')
        .eq('id', commentId)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('code_comments')
        .update({
          resolved: !current.resolved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    comments: commentsQuery.data ?? [],
    isLoading: commentsQuery.isLoading,
    error: commentsQuery.error,
    addComment: addMutation.mutateAsync,
    updateComment: updateMutation.mutateAsync,
    deleteComment: deleteMutation.mutateAsync,
    resolveComment: resolveMutation.mutateAsync,
    isAdding: addMutation.isPending,
  };
}
