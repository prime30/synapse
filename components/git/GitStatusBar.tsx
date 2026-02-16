'use client';

import React from 'react';
import { GitBranch, GitCommit, Cloud, CloudOff, RefreshCw, Loader2, ArrowUp, ArrowDown, AlertCircle, Check, Users } from 'lucide-react';

interface GitStatusBarProps {
  currentBranch: string | null;
  fileStatuses: Array<{ path: string; status: string }> | null;
  status: string; // 'idle' | 'committing' | 'pushing' | 'pulling' | etc.
  lastSyncAt: Date | null;
  error: string | null;
  peers: Array<{ userId: string; name: string; color: string }>;
  onCommit: () => void;
  onPush: () => void;
  onPull: () => void;
  onBranchClick: () => void;
  onRefresh: () => void;
}

export function GitStatusBar({
  currentBranch,
  fileStatuses,
  status,
  lastSyncAt,
  error,
  peers,
  onCommit,
  onPush,
  onPull,
  onBranchClick,
  onRefresh,
}: GitStatusBarProps) {
  const changedFilesCount = fileStatuses?.length || 0;
  const isActive = status !== 'idle';
  const hasError = error !== null;

  const getStatusIcon = () => {
    if (hasError) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    if (isActive) {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    return <Check className="w-4 h-4 text-green-500" />;
  };

  const getLastSyncText = () => {
    if (!lastSyncAt) return 'Never synced';
    const now = new Date();
    const diffMs = now.getTime() - lastSyncAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1m ago';
    if (diffMins < 60) return diffMins + 'm ago';
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1h ago';
    if (diffHours < 24) return diffHours + 'h ago';
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1d ago';
    return diffDays + 'd ago';
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-t border-gray-800 text-sm">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBranchClick}
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
        >
          <GitBranch className="w-4 h-4 text-gray-400" />
          <span className="text-gray-300 font-medium">
            {currentBranch || 'No branch'}
          </span>
        </button>
        {changedFilesCount > 0 && (
          <span className="text-gray-400">
            {changedFilesCount} {changedFilesCount === 1 ? 'change' : 'changes'}
          </span>
        )}
      </div>

      {/* Center */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-gray-400">{getLastSyncText()}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {peers.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-gray-300">{peers.length}</span>
            <div className="flex gap-1">
              {peers.slice(0, 3).map((peer, idx) => (
                <div
                  key={peer.userId}
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: peer.color }}
                  title={peer.name}
                />
              ))}
              {peers.length > 3 && (
                <span className="text-gray-500 text-xs">+{peers.length - 3}</span>
              )}
            </div>
          </div>
        )}
        <button
          onClick={onPull}
          disabled={isActive}
          className={
            'p-1.5 rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed' +
            (isActive ? '' : '')
          }
          title="Pull changes"
        >
          <ArrowDown className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={onPush}
          disabled={isActive}
          className={
            'p-1.5 rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed' +
            (isActive ? '' : '')
          }
          title="Push changes"
        >
          <ArrowUp className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={onCommit}
          disabled={isActive}
          className={
            'p-1.5 rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed' +
            (isActive ? '' : '')
          }
          title="Commit changes"
        >
          <GitCommit className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={onRefresh}
          disabled={isActive}
          className={
            'p-1.5 rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed' +
            (isActive ? '' : '')
          }
          title="Refresh status"
        >
          <RefreshCw className={'w-4 h-4 text-gray-400' + (isActive ? ' animate-spin' : '')} />
        </button>
      </div>
    </div>
  );
}
