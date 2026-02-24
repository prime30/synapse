'use client';

import React, { useCallback, useState } from 'react';
import { ChevronRight } from 'lucide-react';

export interface DependencyTreeFile {
  path: string;
  dependencies: string[];
  tokenCount?: number;
}

interface DependencyTreeProps {
  files: DependencyTreeFile[];
  onFileClick?: (path: string) => void;
}

interface TreeNodeProps {
  file: DependencyTreeFile;
  depth: number;
  fileMap: Map<string, DependencyTreeFile>;
  onFileClick?: (path: string) => void;
}

function TreeNode({ file, depth, fileMap, onFileClick }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDeps = file.dependencies.length > 0;
  const pl = depth * 16; // pl-4 = 16px per level

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (hasDeps) setExpanded((v) => !v);
          else onFileClick?.(file.path);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (hasDeps && !expanded) setExpanded(true);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (expanded) setExpanded(false);
          break;
      }
    },
    [hasDeps, expanded, file.path, onFileClick]
  );

  return (
    <li
      role="treeitem"
      aria-expanded={hasDeps ? expanded : undefined}
      aria-level={depth + 1}
      className="list-none"
    >
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-stone-50 dark:hover:bg-white/5 cursor-pointer min-w-0 ${pl ? '' : ''}`}
        style={{ paddingLeft: pl ? 8 + pl : 8 }}
        onClick={() => {
          if (hasDeps) setExpanded((v) => !v);
          else onFileClick?.(file.path);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <span
          className={`shrink-0 w-4 flex items-center justify-center transition-transform ${
            hasDeps ? '' : 'invisible'
          } ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <ChevronRight className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
        </span>
        <span
          className="text-xs font-mono text-stone-700 dark:text-stone-300 truncate flex-1 min-w-0"
          title={file.path}
        >
          {file.path}
        </span>
        {file.dependencies.length > 0 && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] bg-stone-200 dark:bg-white/10 text-stone-600 dark:text-stone-400">
            {file.dependencies.length}
          </span>
        )}
      </div>
      {hasDeps && expanded && (
        <ul role="group" className="list-none">
          {file.dependencies.map((depPath) => {
            const depFile = fileMap.get(depPath);
            if (depFile) {
              return (
                <TreeNode
                  key={depPath}
                  file={depFile}
                  depth={depth + 1}
                  fileMap={fileMap}
                  onFileClick={onFileClick}
                />
              );
            }
            return (
              <li
                key={depPath}
                role="treeitem"
                aria-level={depth + 2}
                className="list-none"
              >
                <div
                  className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-stone-50 dark:hover:bg-white/5 cursor-pointer min-w-0`}
                  style={{ paddingLeft: 8 + (depth + 1) * 16 }}
                  onClick={() => onFileClick?.(depPath)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onFileClick?.(depPath);
                    }
                  }}
                  tabIndex={0}
                >
                  <span className="shrink-0 w-4" aria-hidden />
                  <span
                    className="text-xs font-mono text-stone-700 dark:text-stone-300 truncate flex-1 min-w-0"
                    title={depPath}
                  >
                    {depPath}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function DependencyTree({ files, onFileClick }: DependencyTreeProps) {
  const fileMap = React.useMemo(
    () => new Map(files.map((f) => [f.path, f])),
    [files]
  );

  // Root nodes: files that are not dependencies of any other file in the set,
  // or all files if we're showing a flat structure
  const roots = React.useMemo(() => {
    const depSet = new Set<string>();
    for (const f of files) {
      for (const d of f.dependencies) depSet.add(d);
    }
    return files.filter((f) => !depSet.has(f.path)).length > 0
      ? files.filter((f) => !depSet.has(f.path))
      : files;
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-stone-500 dark:text-stone-400">
        No dependency data
      </div>
    );
  }

  return (
    <ul role="tree" className="py-2" aria-label="File dependencies">
      {roots.map((file) => (
        <TreeNode
          key={file.path}
          file={file}
          depth={0}
          fileMap={fileMap}
          onFileClick={onFileClick}
        />
      ))}
    </ul>
  );
}
