'use client';

import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

interface FileTreePresenceProps {
  filePath: string;
  presence: WorkspacePresence[];
}

export function FileTreePresence({ filePath, presence }: FileTreePresenceProps) {
  const users = presence.filter((p) => p.file_path === filePath);
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {users.map((user) => (
        <span
          key={user.user_id}
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: user.color }}
          title={user.user_id}
        />
      ))}
    </div>
  );
}
