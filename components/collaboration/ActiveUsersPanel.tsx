'use client';

import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface ActiveUsersPanelProps {
  presence: WorkspacePresence[];
}

export function ActiveUsersPanel({ presence }: ActiveUsersPanelProps) {
  if (presence.length === 0) {
    return (
      <div className="text-xs ide-text-muted">No active users</div>
    );
  }

  return (
    <div className="rounded border ide-border ide-surface-panel p-3">
      <h3 className="text-xs font-semibold ide-text mb-2">Active Users</h3>
      <ul className="space-y-2 text-xs ide-text">
        {presence.map((user) => (
          <li key={user.user_id} className="flex items-center gap-2 min-w-0">
            <UserAvatar
              avatarUrl={user.avatar_url}
              fullName={user.full_name}
              userId={user.user_id}
              fallbackColor={user.color}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <span className="truncate block">
                {user.full_name?.trim() || user.user_id.slice(0, 8) + '…'}
              </span>
              {user.file_path && (
                <span className="ide-text-muted truncate block">{user.file_path}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
