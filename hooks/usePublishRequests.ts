'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PublishRequest {
  id: string;
  project_id: string;
  theme_id: number;
  theme_name: string;
  requester_id: string;
  requester?: { display_name: string; avatar_url: string | null };
  reviewer_id: string | null;
  reviewer?: { display_name: string; avatar_url: string | null };
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string | null;
  review_note: string | null;
  preflight_score: number | null;
  preflight_passed: boolean | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface CreatePublishRequestInput {
  theme_id: number;
  theme_name: string;
  note?: string;
  preflight_score?: number;
  preflight_passed?: boolean;
}

export interface ReviewPublishRequestInput {
  requestId: string;
  review_note?: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePublishRequests(projectId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  // ── Fetch all publish requests for project ──────────────────────────────
  const requestsQuery = useQuery({
    queryKey: ['publish-requests', projectId],
    queryFn: async (): Promise<PublishRequest[]> => {
      const { data, error } = await supabase
        .from('publish_requests')
        .select(
          `
          *,
          requester:profiles!publish_requests_requester_id_fkey(display_name, avatar_url),
          reviewer:profiles!publish_requests_reviewer_id_fkey(display_name, avatar_url)
          `
        )
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      // Flatten the joined profile objects from arrays to single objects
      return (data ?? []).map((row) => ({
        ...row,
        requester: Array.isArray(row.requester) ? row.requester[0] ?? undefined : row.requester ?? undefined,
        reviewer: Array.isArray(row.reviewer) ? row.reviewer[0] ?? undefined : row.reviewer ?? undefined,
      })) as PublishRequest[];
    },
    enabled: !!projectId,
  });

  // ── Create a new publish request ────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: CreatePublishRequestInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('publish_requests')
        .insert({
          project_id: projectId,
          theme_id: input.theme_id,
          theme_name: input.theme_name,
          requester_id: user.id,
          note: input.note ?? null,
          preflight_score: input.preflight_score ?? null,
          preflight_passed: input.preflight_passed ?? null,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publish-requests', projectId] });
    },
  });

  // ── Approve a publish request ───────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, review_note }: ReviewPublishRequestInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('publish_requests')
        .update({
          status: 'approved',
          reviewer_id: user.id,
          review_note: review_note ?? null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publish-requests', projectId] });
    },
  });

  // ── Reject a publish request ────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, review_note }: ReviewPublishRequestInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('publish_requests')
        .update({
          status: 'rejected',
          reviewer_id: user.id,
          review_note: review_note ?? null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publish-requests', projectId] });
    },
  });

  // ── Cancel own pending request ──────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('publish_requests')
        .delete()
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publish-requests', projectId] });
    },
  });

  return {
    requests: requestsQuery.data ?? [],
    isLoading: requestsQuery.isLoading,
    error: requestsQuery.error,

    createRequest: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    approveRequest: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,

    rejectRequest: rejectMutation.mutateAsync,
    isRejecting: rejectMutation.isPending,

    cancelRequest: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}
