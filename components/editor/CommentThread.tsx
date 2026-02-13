'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Reply,
  Pencil,
  Trash2,
  Check,
  User,
} from 'lucide-react';
import type { CodeComment } from '@/hooks/useCodeComments';

// ── Types ────────────────────────────────────────────────────────────────────

interface CommentThreadProps {
  comments: CodeComment[];
  currentUserId: string;
  onAddReply: (parentId: string, content: string) => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onResolve: (commentId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ author }: { author?: CodeComment['author'] }) {
  if (author?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.avatar_url}
        alt={author.display_name}
        className="w-7 h-7 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full ide-surface-inset flex items-center justify-center text-[10px] font-medium ide-text-2">
      {author?.display_name ? getInitials(author.display_name) : <User className="w-3.5 h-3.5" />}
    </div>
  );
}

// ── Single comment ───────────────────────────────────────────────────────────

function CommentItem({
  comment,
  currentUserId,
  isTopLevel,
  onReply,
  onUpdate,
  onDelete,
  onResolve,
}: {
  comment: CodeComment;
  currentUserId: string;
  isTopLevel: boolean;
  onReply: (parentId: string) => void;
  onUpdate: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onResolve: (commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const isOwn = comment.author_id === currentUserId;

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== comment.content) {
      onUpdate(comment.id, trimmed);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setEditing(false);
  };

  return (
    <div className="group flex gap-2">
      <Avatar author={comment.author} />

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium ide-text-2 truncate">
            {comment.author?.display_name ?? 'Unknown'}
          </span>
          <span className="ide-text-muted shrink-0">{relativeTime(comment.created_at)}</span>
          {isTopLevel && comment.resolved && (
            <span className="flex items-center gap-0.5 text-accent text-[10px]">
              <Check className="w-3 h-3" /> Resolved
            </span>
          )}
        </div>

        {/* Content or edit form */}
        {editing ? (
          <div className="mt-1">
            <textarea
              className="w-full ide-surface-input border ide-border rounded px-2 py-1 text-sm ide-text resize-none focus:outline-none focus:border-sky-500 dark:focus:border-sky-400"
              rows={2}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              autoFocus
            />
            <div className="flex gap-1 mt-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-2 py-0.5 bg-sky-500 hover:bg-sky-600 text-white text-xs rounded transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-2 py-0.5 ide-surface-input ide-text-2 hover:ide-text ide-hover text-xs rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-sm ide-text-2 whitespace-pre-wrap break-words">
            {comment.content}
          </p>
        )}

        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onReply(comment.parent_id ?? comment.id)}
              className="flex items-center gap-0.5 ide-text-muted hover:ide-text-2 text-xs transition-colors"
            >
              <Reply className="w-3 h-3" /> Reply
            </button>

            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditContent(comment.content);
                    setEditing(true);
                  }}
                  className="flex items-center gap-0.5 ide-text-muted hover:ide-text-2 text-xs transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(comment.id)}
                  className="flex items-center gap-0.5 ide-text-muted hover:text-red-500 dark:hover:text-red-400 text-xs transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </>
            )}

            {isTopLevel && (
              <button
                type="button"
                onClick={() => onResolve(comment.id)}
                className={`flex items-center gap-0.5 text-xs transition-colors ${
                  comment.resolved
                    ? 'text-accent hover:opacity-80'
                    : 'ide-text-muted hover:text-accent'
                }`}
              >
                <Check className="w-3 h-3" />
                {comment.resolved ? 'Unresolve' : 'Resolve'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reply form ───────────────────────────────────────────────────────────────

function ReplyForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (content: string) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setContent('');
  };

  return (
    <div className="mt-2 ml-9">
      <textarea
        className="w-full ide-surface-input border ide-border rounded px-2 py-1.5 text-sm ide-text resize-none focus:outline-none focus:border-sky-500 dark:focus:border-sky-400 placeholder-ide-text-muted"
        rows={2}
        placeholder="Write a reply..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex gap-1 mt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim()}
          className="px-2 py-0.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-0.5 ide-surface-input ide-text-2 hover:ide-text ide-hover text-xs rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main CommentThread component ─────────────────────────────────────────────

export default function CommentThread({
  comments,
  currentUserId,
  onAddReply,
  onUpdate,
  onDelete,
  onResolve,
}: CommentThreadProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const handleReply = (parentId: string) => {
    setReplyingTo(parentId);
  };

  const handleSubmitReply = (parentId: string, content: string) => {
    onAddReply(parentId, content);
    setReplyingTo(null);
  };

  if (comments.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm ide-text-muted">
        <MessageSquare className="w-4 h-4" />
        No comments on this line
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg ide-surface-panel border ide-border p-3">
      {comments.map((topComment) => (
        <div key={topComment.id}>
          {/* Top-level comment */}
          <CommentItem
            comment={topComment}
            currentUserId={currentUserId}
            isTopLevel
            onReply={handleReply}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onResolve={onResolve}
          />

          {/* Threaded replies */}
          {topComment.replies && topComment.replies.length > 0 && (
            <div className="ml-9 mt-2 flex flex-col gap-2 border-l ide-border pl-3">
              {topComment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  isTopLevel={false}
                  onReply={handleReply}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onResolve={onResolve}
                />
              ))}
            </div>
          )}

          {/* Reply form for this thread */}
          {replyingTo === topComment.id && (
            <ReplyForm
              onSubmit={(content) => handleSubmitReply(topComment.id, content)}
              onCancel={() => setReplyingTo(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
