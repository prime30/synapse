'use client';

import React, { useState, useMemo } from 'react';
import { AlertTriangle, Check, X, ChevronDown, ChevronRight, GitMerge, ArrowLeft, ArrowRight } from 'lucide-react';

interface Conflict {
  path: string;
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
}

interface Resolution {
  path: string;
  content: string;
  strategy: 'ours' | 'theirs' | 'manual';
}

interface MergeConflictPanelProps {
  conflicts: Conflict[];
  onResolve: (resolutions: Resolution[]) => void;
  onCancel: () => void;
}

type ResolutionState = 'unresolved' | 'resolved-ours' | 'resolved-theirs' | 'resolved-manual';

export default function MergeConflictPanel({ conflicts, onResolve, onCancel }: MergeConflictPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string>(conflicts.length > 0 ? conflicts[0].path : '');
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({});
  const [manualEdits, setManualEdits] = useState<Record<string, string>>({});
  const [showManualEdit, setShowManualEdit] = useState<Record<string, boolean>>({});

  const selectedConflict = conflicts.find(c => c.path === selectedPath);

  const resolutionCount = useMemo(() => {
    return Object.values(resolutions).filter(r => r !== 'unresolved').length;
  }, [resolutions]);

  const allResolved = resolutionCount === conflicts.length;

  const getResolutionState = (path: string): ResolutionState => {
    return resolutions[path] || 'unresolved';
  };

  const handleAcceptOurs = (path: string) => {
    setResolutions(prev => ({ ...prev, [path]: 'resolved-ours' }));
    setShowManualEdit(prev => ({ ...prev, [path]: false }));
  };

  const handleAcceptTheirs = (path: string) => {
    setResolutions(prev => ({ ...prev, [path]: 'resolved-theirs' }));
    setShowManualEdit(prev => ({ ...prev, [path]: false }));
  };

  const handleEditManually = (path: string) => {
    const conflict = conflicts.find(c => c.path === path);
    if (conflict) {
      const merged = conflict.oursContent + '\n' + conflict.theirsContent;
      setManualEdits(prev => ({ ...prev, [path]: merged }));
      setShowManualEdit(prev => ({ ...prev, [path]: true }));
    }
  };

  const handleManualEditChange = (path: string, content: string) => {
    setManualEdits(prev => ({ ...prev, [path]: content }));
  };

  const handleSaveManualEdit = (path: string) => {
    setResolutions(prev => ({ ...prev, [path]: 'resolved-manual' }));
    setShowManualEdit(prev => ({ ...prev, [path]: false }));
  };

  const handleApplyResolutions = () => {
    const resolutionArray: Resolution[] = conflicts.map(conflict => {
      const state = getResolutionState(conflict.path);
      let content = '';
      let strategy: 'ours' | 'theirs' | 'manual' = 'ours';

      if (state === 'resolved-ours') {
        content = conflict.oursContent;
        strategy = 'ours';
      } else if (state === 'resolved-theirs') {
        content = conflict.theirsContent;
        strategy = 'theirs';
      } else if (state === 'resolved-manual') {
        content = manualEdits[conflict.path] || conflict.oursContent;
        strategy = 'manual';
      } else {
        content = conflict.oursContent;
        strategy = 'ours';
      }

      return {
        path: conflict.path,
        content,
        strategy
      };
    });

    onResolve(resolutionArray);
  };

  const getDiffLines = (ours: string, theirs: string): { ours: string[], theirs: string[] } => {
    const oursLines = ours.split('\n');
    const theirsLines = theirs.split('\n');
    return { ours: oursLines, theirs: theirsLines };
  };

  const highlightDiff = (line: string, otherLine: string): string => {
    if (line === otherLine) {
      return 'ide-surface-inset';
    }
    if (line.trim() === '') {
      return 'ide-surface-panel';
    }
    return 'bg-green-900/30';
  };

  const highlightDiffTheirs = (line: string, otherLine: string): string => {
    if (line === otherLine) {
      return 'ide-surface-inset';
    }
    if (line.trim() === '') {
      return 'ide-surface-panel';
    }
    return 'bg-red-900/30';
  };

  return (
    <div className="flex flex-col h-full ide-surface-panel ide-text">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b ide-border">
        <div className="flex items-center gap-3">
          <GitMerge className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Resolve Merge Conflicts</h2>
          <span className="px-2 py-1 text-sm ide-surface-inset border ide-border rounded">
            {resolutionCount} / {conflicts.length} resolved
          </span>
        </div>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm ide-surface-inset ide-hover border ide-border rounded transition-colors flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File List Sidebar */}
        <div className="w-64 border-r ide-border ide-surface-panel overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-medium ide-text-muted mb-3">Conflicting Files</h3>
            <div className="space-y-1">
              {conflicts.map(conflict => {
                const state = getResolutionState(conflict.path);
                const isSelected = selectedPath === conflict.path;
                const isResolved = state !== 'unresolved';

                return (
                  <button
                    key={conflict.path}
                    onClick={() => setSelectedPath(conflict.path)}
                    className={
                      'w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 ' +
                      (isSelected
                        ? 'ide-surface-inset border ide-border'
                        : 'ide-hover border border-transparent')
                    }
                  >
                    {isResolved ? (
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{conflict.path}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Resolution Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedConflict ? (
            <>
              <div className="px-6 py-4 border-b ide-border ide-surface-panel">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-medium">{selectedConflict.path}</h3>
                  <div className="flex items-center gap-2">
                    {getResolutionState(selectedConflict.path) !== 'unresolved' && (
                      <span className="px-2 py-1 text-xs bg-green-900/30 text-green-400 border border-green-800 rounded">
                        Resolved
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {showManualEdit[selectedConflict.path] ? (
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">Manual Edit</h4>
                    <textarea
                      value={manualEdits[selectedConflict.path] || ''}
                      onChange={(e) => handleManualEditChange(selectedConflict.path, e.target.value)}
                      className="w-full h-full p-4 ide-input font-mono text-sm resize-none"
                      style={{ minHeight: '400px' }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveManualEdit(selectedConflict.path)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Save Manual Edit
                    </button>
                    <button
                      onClick={() => setShowManualEdit(prev => ({ ...prev, [selectedConflict.path]: false }))}
                      className="px-4 py-2 ide-surface-inset ide-hover border ide-border rounded text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex overflow-hidden">
                  {/* Ours (Local) Panel */}
                  <div className="flex-1 flex flex-col border-r ide-border">
                    <div className="px-4 py-2 ide-surface-panel border-b ide-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-medium">Ours (Local)</span>
                      </div>
                      {getResolutionState(selectedConflict.path) === 'resolved-ours' && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 overflow-auto ide-surface-panel">
                      <pre className="p-4 text-sm font-mono">
                        <code>
                          {selectedConflict.oursContent.split('\n').map((line, idx) => {
                            const theirsLines = selectedConflict.theirsContent.split('\n');
                            const otherLine = theirsLines[idx] || '';
                            const highlightClass = highlightDiff(line, otherLine);
                            return (
                              <div key={idx} className={highlightClass + ' px-2 py-0.5'}>
                                {line || '\u00A0'}
                              </div>
                            );
                          })}
                        </code>
                      </pre>
                    </div>
                  </div>

                  {/* Theirs (Remote) Panel */}
                  <div className="flex-1 flex flex-col">
                    <div className="px-4 py-2 ide-surface-panel border-b ide-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium">Theirs (Remote)</span>
                      </div>
                      {getResolutionState(selectedConflict.path) === 'resolved-theirs' && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 overflow-auto ide-surface-panel">
                      <pre className="p-4 text-sm font-mono">
                        <code>
                          {selectedConflict.theirsContent.split('\n').map((line, idx) => {
                            const oursLines = selectedConflict.oursContent.split('\n');
                            const otherLine = oursLines[idx] || '';
                            const highlightClass = highlightDiffTheirs(line, otherLine);
                            return (
                              <div key={idx} className={highlightClass + ' px-2 py-0.5'}>
                                {line || '\u00A0'}
                              </div>
                            );
                          })}
                        </code>
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolution Buttons */}
              {!showManualEdit[selectedConflict.path] && (
                <div className="px-6 py-4 border-t ide-border ide-surface-panel">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAcceptOurs(selectedConflict.path)}
                      className={
                        'px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 ' +
                        (getResolutionState(selectedConflict.path) === 'resolved-ours'
                          ? 'bg-blue-600 text-white'
                          : 'ide-surface-inset ide-hover border ide-border')
                      }
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Accept Ours
                    </button>
                    <button
                      onClick={() => handleAcceptTheirs(selectedConflict.path)}
                      className={
                        'px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 ' +
                        (getResolutionState(selectedConflict.path) === 'resolved-theirs'
                          ? 'bg-purple-600 text-white'
                          : 'ide-surface-inset ide-hover border ide-border')
                      }
                    >
                      <ArrowRight className="w-4 h-4" />
                      Accept Theirs
                    </button>
                    <button
                      onClick={() => handleEditManually(selectedConflict.path)}
                      className={
                        'px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 ' +
                        (getResolutionState(selectedConflict.path) === 'resolved-manual'
                          ? 'bg-green-600 text-white'
                          : 'ide-surface-inset ide-hover border ide-border')
                      }
                    >
                      Edit Manually
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center ide-text-muted">
              <p>No conflicts to resolve</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t ide-border ide-surface-panel flex items-center justify-between">
        <div className="text-sm ide-text-muted">
          {resolutionCount} of {conflicts.length} conflicts resolved
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 ide-surface-inset ide-hover border ide-border rounded text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyResolutions}
            disabled={!allResolved}
            className={
              'px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 ' +
              (allResolved
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-stone-700 ide-text-3 cursor-not-allowed border ide-border')
            }
          >
            <Check className="w-4 h-4" />
            Apply Resolutions
          </button>
        </div>
      </div>
    </div>
  );
}
