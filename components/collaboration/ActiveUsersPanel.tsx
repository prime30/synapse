'use client';

import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

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
          <li key={user.user_id} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: user.color }}
            />
            <span className="truncate">{user.user_id}</span>
            {user.file_path && (
              <span className="text-gray-400 truncate">{user.file_path}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
