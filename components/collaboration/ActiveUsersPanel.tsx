'use client';

import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface ActiveUsersPanelProps {
  presence: WorkspacePresence[];
}

export function ActiveUsersPanel({ presence }: ActiveUsersPanelProps) {
  if (presence.length === 0) {
    return (
      <div className="text-xs text-gray-500">No active users</div>
    );
  }

  return (
    <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
      <h3 className="text-xs font-semibold text-gray-300 mb-2">Active Users</h3>
      <ul className="space-y-2 text-xs text-gray-200">
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
                <span className="text-gray-400 truncate block">{user.file_path}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
