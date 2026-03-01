'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, GitCommit, Plus, Minus, File, Check } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';
import { Modal } from '@/components/ui/Modal';

interface CommitDialogProps {
  open: boolean;
  onClose: () => void;
  onCommit: (message: string, files?: string[]) => Promise<void>;
  fileStatuses: Array<{ path: string; status: string }> | null;
  isCommitting: boolean;
}

export default function CommitDialog({
  open,
  onClose,
  onCommit,
  fileStatuses,
  isCommitting,
}: CommitDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const subjectInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected files when fileStatuses change
  useEffect(() => {
    if (fileStatuses && fileStatuses.length > 0) {
      const paths = fileStatuses.map(f => f.path);
      requestAnimationFrame(() => setSelectedFiles(new Set(paths)));
    } else {
      requestAnimationFrame(() => setSelectedFiles(new Set()));
    }
  }, [fileStatuses]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      requestAnimationFrame(() => {
        setSubject('');
        setBody('');
        setSelectedFiles(new Set());
      });
    }
  }, [open]);

  // Auto-focus subject input when dialog opens
  useEffect(() => {
    if (open && subjectInputRef.current) {
      setTimeout(() => {
        subjectInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const handleCommit = useCallback(async () => {
    if (!subject.trim() || selectedFiles.size === 0) return;

    const message = body.trim() ? subject.trim() + '\n\n' + body.trim() : subject.trim();
    const files = Array.from(selectedFiles);
    
    await onCommit(message, files);
  }, [subject, body, selectedFiles, onCommit]);

  // Keyboard shortcut: Ctrl+Enter to commit (Escape is handled by shared Modal)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (subject.trim() && selectedFiles.size > 0 && !isCommitting) {
          handleCommit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, subject, selectedFiles.size, isCommitting, handleCommit]);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (fileStatuses) {
      setSelectedFiles(new Set(fileStatuses.map(f => f.path)));
    }
  }, [fileStatuses]);

  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  const getStatusColor = (status: string) => {
    if (status === 'added' || status === 'A' || status === '??') {
      return 'text-green-400';
    } else if (status === 'modified' || status === 'M' || status === 'modified:') {
      return 'text-yellow-400';
    } else if (status === 'deleted' || status === 'D' || status === 'deleted:') {
      return 'text-red-400';
    }
    return 'ide-text-muted';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'added' || status === 'A' || status === '??') {
      return <Plus className="w-4 h-4" />;
    } else if (status === 'deleted' || status === 'D' || status === 'deleted:') {
      return <Minus className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
  };

  const canCommit = subject.trim().length > 0 && selectedFiles.size > 0 && !isCommitting;
  const allSelected = fileStatuses && fileStatuses.length > 0 && selectedFiles.size === fileStatuses.length;
  const someSelected = selectedFiles.size > 0 && selectedFiles.size < (fileStatuses?.length || 0);

  const headerContent = (
    <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-[#2a2a2a]">
      <div className="flex items-center gap-2">
        <GitCommit className="w-5 h-5 ide-text-muted" />
        <h2 className="text-lg font-semibold ide-text">Create Commit</h2>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded ide-hover ide-text-muted hover:ide-text transition-colors"
        disabled={isCommitting}
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const footerContent = (
    <div className="flex items-center justify-end gap-3">
      <button
        onClick={onClose}
        disabled={isCommitting}
        className="px-4 py-2 rounded text-sm font-medium transition-colors ide-text-2 hover:ide-text ide-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        onClick={handleCommit}
        disabled={!canCommit}
        className={
          'px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ' +
          (canCommit ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-stone-700 ide-text-3 cursor-not-allowed')
        }
      >
        {isCommitting && <LambdaDots size={16} />}
        <span>Commit</span>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      header={headerContent}
      footer={footerContent}
      size="lg"
      bodyClassName="p-4 max-h-[60vh]"
    >
      {/* File List Section */}
      {fileStatuses && fileStatuses.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium ide-text-2">Files</h3>
            <div className="flex items-center gap-2">
              {someSelected && (
                <button
                  onClick={selectAll}
                  className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                  disabled={isCommitting}
                >
                  Select All
                </button>
              )}
              {allSelected && (
                <button
                  onClick={deselectAll}
                  className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                  disabled={isCommitting}
                >
                  Deselect All
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 mb-3">
            {fileStatuses.map((file) => {
              const isSelected = selectedFiles.has(file.path);
              const statusColor = getStatusColor(file.status);

              return (
                <label
                  key={file.path}
                  className="flex items-center gap-3 p-2 rounded ide-hover cursor-pointer transition-colors"
                >
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFile(file.path)}
                      disabled={isCommitting}
                      className="sr-only"
                    />
                    <div
                      className={
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ' +
                        (isSelected ? 'bg-sky-500 border-sky-500' : 'ide-border ide-surface-inset')
                      }
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                  <div className={'flex items-center gap-2 ' + statusColor}>
                    {getStatusIcon(file.status)}
                  </div>
                  <span className="flex-1 text-sm ide-text-2 truncate">{file.path}</span>
                  <span className={'text-xs px-2 py-1 rounded ' + statusColor + ' bg-opacity-10'}>
                    {file.status}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="text-xs ide-text-3">
            {selectedFiles.size} {selectedFiles.size === 1 ? 'file' : 'files'} selected
          </div>
        </div>
      )}

      {/* Commit Message Section */}
      <div>
        <h3 className="text-sm font-medium ide-text-2 mb-3">Commit Message</h3>

        {/* Subject */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs ide-text-muted">Subject (required)</label>
            <span className={'text-xs ' + (subject.length > 72 ? 'text-red-400' : 'ide-text-3')}>
              {subject.length}/72
            </span>
          </div>
          <input
            ref={subjectInputRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="feat: describe your changes"
            maxLength={72}
            disabled={isCommitting}
            className={
              'w-full px-3 py-2 ide-input ' +
              'disabled:opacity-50 disabled:cursor-not-allowed ' +
              (subject.length > 72 ? '!border-red-500' : '')
            }
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-xs ide-text-muted mb-1 block">Body (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Additional details about your changes..."
            rows={4}
            disabled={isCommitting}
            className={
              'w-full px-3 py-2 ide-input ' +
              'resize-none disabled:opacity-50 disabled:cursor-not-allowed'
            }
          />
        </div>
      </div>
    </Modal>
  );
}
