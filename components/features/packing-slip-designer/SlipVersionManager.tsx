'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Plus,
  Save,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  FileText,
} from 'lucide-react';
import type { SavedSlip } from '@/lib/packing-slip-designer/types';

interface SlipVersionManagerProps {
  slips: SavedSlip[];
  activeId: string | null;
  hasUnsavedChanges: boolean;
  onSelect: (id: string) => void;
  onSave: () => void;
  onSaveAs: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function SlipVersionManager({
  slips,
  activeId,
  hasUnsavedChanges,
  onSelect,
  onSave,
  onSaveAs,
  onRename,
  onDuplicate,
  onDelete,
  onNew,
}: SlipVersionManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsValue, setSaveAsValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const saveAsInputRef = useRef<HTMLInputElement>(null);

  const activeSlip = slips.find((s) => s.id === activeId);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setRenamingId(null);
        setShowSaveAs(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (showSaveAs && saveAsInputRef.current) {
      saveAsInputRef.current.focus();
    }
  }, [showSaveAs]);

  const handleStartRename = useCallback((slip: SavedSlip) => {
    setRenamingId(slip.id);
    setRenameValue(slip.name);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, onRename]);

  const handleConfirmSaveAs = useCallback(() => {
    if (saveAsValue.trim()) {
      onSaveAs(saveAsValue.trim());
      setShowSaveAs(false);
      setSaveAsValue('');
      setIsOpen(false);
    }
  }, [saveAsValue, onSaveAs]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      setIsOpen(false);
    },
    [onSelect],
  );

  return (
    <div ref={dropdownRef} className="relative">
      <div className="flex items-center gap-1.5">
        {/* Version selector button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-stone-50 dark:hover:bg-white/10 transition-colors max-w-[240px]"
        >
          <FileText size={14} className="text-stone-400 dark:text-white/40 shrink-0" />
          <span className="text-sm text-stone-700 dark:text-white/80 truncate">
            {activeSlip?.name ?? 'No slip selected'}
          </span>
          {hasUnsavedChanges && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />
          )}
          <ChevronDown size={14} className="text-stone-400 dark:text-white/40 shrink-0" />
        </button>

        {/* Quick save button */}
        {activeSlip && (
          <button
            onClick={onSave}
            disabled={!hasUnsavedChanges}
            className="p-1.5 rounded-md border border-stone-200 dark:border-white/10 text-stone-500 dark:text-white/50 hover:bg-stone-50 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-default"
            title={hasUnsavedChanges ? 'Save changes (Ctrl+S)' : 'No unsaved changes'}
          >
            <Save size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-80 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-xl z-50 overflow-hidden">
          {/* Actions bar */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-stone-100 dark:border-white/5">
            <button
              onClick={() => {
                onNew();
                setIsOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-stone-600 dark:text-white/60 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
            >
              <Plus size={12} />
              New
            </button>
            <button
              onClick={() => {
                setShowSaveAs(true);
                setSaveAsValue(activeSlip ? `${activeSlip.name} (copy)` : 'New Slip');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-stone-600 dark:text-white/60 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
            >
              <Save size={12} />
              Save As
            </button>
          </div>

          {/* Save As input */}
          {showSaveAs && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100 dark:border-white/5 bg-stone-50 dark:bg-white/5">
              <input
                ref={saveAsInputRef}
                value={saveAsValue}
                onChange={(e) => setSaveAsValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmSaveAs();
                  if (e.key === 'Escape') setShowSaveAs(false);
                }}
                className="flex-1 px-2 py-1 text-xs rounded border border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Slip name..."
              />
              <button
                onClick={handleConfirmSaveAs}
                className="p-1 rounded text-accent hover:bg-accent/10 transition-colors"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setShowSaveAs(false)}
                className="p-1 rounded text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Slip list */}
          <div className="max-h-[300px] overflow-y-auto">
            {slips.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-stone-400 dark:text-white/30">
                  No saved slips yet. Create one from a template or import.
                </p>
              </div>
            ) : (
              slips.map((slip) => (
                <div
                  key={slip.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    slip.id === activeId
                      ? 'bg-accent/10 dark:bg-accent/20'
                      : 'hover:bg-stone-50 dark:hover:bg-white/5'
                  }`}
                >
                  {renamingId === slip.id ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="flex-1 px-2 py-0.5 text-xs rounded border border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <button
                        onClick={handleConfirmRename}
                        className="p-0.5 rounded text-accent hover:bg-accent/10"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="p-0.5 rounded text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => handleSelect(slip.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-stone-800 dark:text-white/90 truncate">
                            {slip.name}
                          </span>
                          {slip.id === activeId && (
                            <span className="shrink-0 text-[10px] font-medium text-accent">
                              active
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-stone-400 dark:text-white/30 mt-0.5">
                          Updated {new Date(slip.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStartRename(slip); }}
                          className="p-1 rounded text-stone-400 dark:text-white/30 hover:text-stone-600 dark:hover:text-white/60 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
                          title="Rename"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDuplicate(slip.id); }}
                          className="p-1 rounded text-stone-400 dark:text-white/30 hover:text-stone-600 dark:hover:text-white/60 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
                          title="Duplicate"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (slips.length > 1 || confirm('Delete this packing slip?')) {
                              onDelete(slip.id);
                            }
                          }}
                          className="p-1 rounded text-stone-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
