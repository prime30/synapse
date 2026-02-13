'use client';

import { useState, useCallback, useEffect } from 'react';
import { UserAvatar } from '@/components/ui/UserAvatar';

export interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  /** Initial values */
  fullName: string;
  avatarUrl: string;
  /** Called after successful save (so parent can refresh profile) */
  onSaved?: () => void;
}

export function ProfileEditModal({
  open,
  onClose,
  fullName: initialFullName,
  avatarUrl: initialAvatarUrl,
  onSaved,
}: ProfileEditModalProps) {
  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFullName(initialFullName);
      setAvatarUrl(initialAvatarUrl);
      setError(null);
    }
  }, [open, initialFullName, initialAvatarUrl]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSaving(true);
      try {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName.trim() || null,
            avatar_url: avatarUrl.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? 'Failed to update profile');
          return;
        }
        window.dispatchEvent(new CustomEvent('profile-updated'));
        onSaved?.();
        onClose();
      } finally {
        setSaving(false);
      }
    },
    [fullName, avatarUrl, onClose, onSaved]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 ide-overlay"
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        aria-label="Close"
      />
      <div className="relative w-full max-w-md rounded-lg border ide-border ide-surface-panel shadow-xl">
        <div className="p-4 border-b ide-border">
          <h2 className="text-lg font-semibold ide-text">Edit profile</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="profile-full-name" className="block text-sm font-medium ide-text mb-1">
              Display name
            </label>
            <input
              id="profile-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 text-sm rounded-md ide-input"
            />
          </div>
          <div>
            <label htmlFor="profile-avatar-url" className="block text-sm font-medium ide-text mb-1">
              Profile image URL
            </label>
            <input
              id="profile-avatar-url"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm rounded-md ide-input"
            />
            {avatarUrl.trim() && (
              <div className="mt-2 flex items-center gap-2">
                <UserAvatar
                  avatarUrl={avatarUrl.trim()}
                  fullName={fullName.trim() || undefined}
                  size="md"
                />
                <span className="text-xs ide-text-muted">Preview</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium rounded-md ide-text ide-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
