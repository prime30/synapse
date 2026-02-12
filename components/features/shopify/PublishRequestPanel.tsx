'use client';

import { useState } from 'react';
import {
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  MessageSquare,
  AlertTriangle,
  User,
} from 'lucide-react';
import {
  usePublishRequests,
  type PublishRequest,
} from '@/hooks/usePublishRequests';

// ── Props ────────────────────────────────────────────────────────────────────

interface PublishRequestPanelProps {
  projectId: string;
  currentUserId: string;
  userRole: 'owner' | 'admin' | 'member';
  themes: { id: number; name: string; role: string }[];
}

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<
  PublishRequest['status'],
  { bg: string; text: string; label: string }
> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Pending' },
  approved: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Approved' },
  rejected: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Rejected' },
  cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: PublishRequest['status'] }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

function PreflightIndicator({
  passed,
  score,
}: {
  passed: boolean | null;
  score: number | null;
}) {
  if (passed === null || passed === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <span className="w-3 h-0.5 bg-gray-600 rounded" />
        Not run
      </span>
    );
  }
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <CheckCircle className="w-3.5 h-3.5" />
        {score !== null ? `${score}/100` : 'Passed'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400">
      <XCircle className="w-3.5 h-3.5" />
      {score !== null ? `${score}/100` : 'Failed'}
    </span>
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  request,
  isAdmin,
  isOwner,
  currentUserId,
  onApprove,
  onReject,
  onCancel,
  isApproving,
  isRejecting,
  isCancelling,
}: {
  request: PublishRequest;
  isAdmin: boolean;
  isOwner: boolean;
  currentUserId: string;
  onApprove: (id: string, note?: string) => void;
  onReject: (id: string, note?: string) => void;
  onCancel: (id: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
  isCancelling: boolean;
}) {
  const [reviewNote, setReviewNote] = useState('');
  const canReview = (isAdmin || isOwner) && request.status === 'pending';
  const canCancel =
    request.requester_id === currentUserId && request.status === 'pending';

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge status={request.status} />
          <span className="text-sm font-medium text-gray-200">
            {request.theme_name}
          </span>
        </div>
        <PreflightIndicator
          passed={request.preflight_passed}
          score={request.preflight_score}
        />
      </div>

      {/* Requester + timestamp */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <User className="w-3.5 h-3.5" />
        <span>{request.requester?.display_name ?? 'Unknown user'}</span>
        <Clock className="w-3.5 h-3.5 ml-2" />
        <span>{formatTime(request.created_at)}</span>
      </div>

      {/* Requester note */}
      {request.note && (
        <div className="flex items-start gap-2 text-xs text-gray-300 bg-gray-800/50 rounded p-2">
          <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-500" />
          <span>{request.note}</span>
        </div>
      )}

      {/* Review note (if reviewed) */}
      {request.review_note && (
        <div className="flex items-start gap-2 text-xs text-gray-300 bg-gray-800/50 rounded p-2">
          <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-500" />
          <div>
            <span className="text-gray-500">
              {request.reviewer?.display_name ?? 'Reviewer'}:{' '}
            </span>
            <span>{request.review_note}</span>
          </div>
        </div>
      )}

      {/* Reviewed timestamp */}
      {request.reviewed_at && (
        <div className="text-xs text-gray-500">
          Reviewed {formatTime(request.reviewed_at)}
        </div>
      )}

      {/* Admin actions */}
      {canReview && (
        <div className="space-y-2 pt-2 border-t border-gray-800">
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Review note (optional)…"
            rows={2}
            className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onApprove(request.id, reviewNote || undefined);
                setReviewNote('');
              }}
              disabled={isApproving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isApproving ? 'Approving…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => {
                onReject(request.id, reviewNote || undefined);
                setReviewNote('');
              }}
              disabled={isRejecting}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              {isRejecting ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel action for requester */}
      {canCancel && (
        <div className="pt-2 border-t border-gray-800">
          <button
            type="button"
            onClick={() => onCancel(request.id)}
            disabled={isCancelling}
            className="w-full px-3 py-1.5 text-xs font-medium rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCancelling ? 'Cancelling…' : 'Cancel Request'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function PublishRequestPanel({
  projectId,
  currentUserId,
  userRole,
  themes,
}: PublishRequestPanelProps) {
  const {
    requests,
    isLoading,
    error,
    createRequest,
    isCreating,
    approveRequest,
    isApproving,
    rejectRequest,
    isRejecting,
    cancelRequest,
    isCancelling,
  } = usePublishRequests(projectId);

  const [selectedThemeId, setSelectedThemeId] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const isAdmin = userRole === 'admin' || userRole === 'owner';

  const handleSubmit = async () => {
    if (selectedThemeId === '') return;
    const theme = themes.find((t) => t.id === selectedThemeId);
    if (!theme) return;

    try {
      await createRequest({
        theme_id: theme.id,
        theme_name: theme.name,
        note: note.trim() || undefined,
      });
      setSelectedThemeId('');
      setNote('');
    } catch (err) {
      console.error('Failed to create publish request:', err);
    }
  };

  const handleApprove = async (requestId: string, reviewNote?: string) => {
    try {
      await approveRequest({ requestId, review_note: reviewNote });
    } catch (err) {
      console.error('Failed to approve request:', err);
    }
  };

  const handleReject = async (requestId: string, reviewNote?: string) => {
    try {
      await rejectRequest({ requestId, review_note: reviewNote });
    } catch (err) {
      console.error('Failed to reject request:', err);
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await cancelRequest(requestId);
    } catch (err) {
      console.error('Failed to cancel request:', err);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const resolvedRequests = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="flex flex-col h-full bg-gray-900/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-gray-100">
            Publish Requests
          </h2>
          {pendingRequests.length > 0 && (
            <span className="ml-auto inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400">
              {pendingRequests.length} pending
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Request form (for members, or anyone who wants to request) */}
        {userRole === 'member' && (
          <div className="border border-gray-800 rounded-lg bg-gray-900/80 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <Send className="w-4 h-4 text-blue-400" />
              Request Publish
            </div>

            <p className="text-xs text-gray-500">
              Select a theme and submit for admin approval to publish to live.
            </p>

            {/* Theme selector */}
            <select
              value={selectedThemeId}
              onChange={(e) =>
                setSelectedThemeId(
                  e.target.value === '' ? '' : Number(e.target.value)
                )
              }
              className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a theme…</option>
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.role})
                </option>
              ))}
            </select>

            {/* Note textarea */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedThemeId === '' || isCreating}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {isCreating ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        )}

        {/* Admin notice */}
        {isAdmin && pendingRequests.length > 0 && (
          <div className="flex items-start gap-2 p-3 text-xs rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''}{' '}
              awaiting your review.
            </span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-3 text-xs rounded bg-red-500/10 border border-red-500/20 text-red-400">
            {error.message}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="border border-gray-800 rounded-lg bg-gray-900/50 p-4 space-y-3 animate-pulse"
              >
                <div className="flex items-center gap-2">
                  <div className="w-16 h-5 bg-gray-700 rounded" />
                  <div className="w-24 h-4 bg-gray-700 rounded" />
                </div>
                <div className="h-4 bg-gray-700 rounded w-3/4" />
                <div className="h-8 bg-gray-700 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Pending requests section */}
        {!isLoading && pendingRequests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Pending
            </h3>
            {pendingRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isAdmin={isAdmin}
                isOwner={userRole === 'owner'}
                currentUserId={currentUserId}
                onApprove={handleApprove}
                onReject={handleReject}
                onCancel={handleCancel}
                isApproving={isApproving}
                isRejecting={isRejecting}
                isCancelling={isCancelling}
              />
            ))}
          </div>
        )}

        {/* Resolved requests section */}
        {!isLoading && resolvedRequests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              History
            </h3>
            {resolvedRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isAdmin={isAdmin}
                isOwner={userRole === 'owner'}
                currentUserId={currentUserId}
                onApprove={handleApprove}
                onReject={handleReject}
                onCancel={handleCancel}
                isApproving={isApproving}
                isRejecting={isRejecting}
                isCancelling={isCancelling}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && requests.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">
            <Shield className="w-8 h-8 mx-auto mb-3 text-gray-600" />
            <p className="mb-1">No publish requests yet.</p>
            <p className="text-xs text-gray-600">
              {userRole === 'member'
                ? 'Select a theme above to request publishing.'
                : 'Members will submit publish requests here for your review.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
