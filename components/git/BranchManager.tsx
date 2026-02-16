'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GitBranch, Plus, Check, X } from 'lucide-react';

interface BranchManagerProps {
  open: boolean;
  onClose: () => void;
  branches: string[];
  currentBranch: string;
  onCheckout: (branch: string) => void;
  onCreate: (name: string) => void;
}

export function BranchManager({
  open,
  onClose,
  branches,
  currentBranch,
  onCheckout,
  onCreate,
}: BranchManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranchInput, setShowNewBranchInput] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  const filteredBranches = branches.filter((branch) =>
    branch.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setSearchQuery('');
        setNewBranchName('');
        setShowNewBranchInput(false);
      });
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const handleCreateBranch = () => {
    if (newBranchName.trim() && !branches.includes(newBranchName.trim())) {
      onCreate(newBranchName.trim());
      setNewBranchName('');
      setShowNewBranchInput(false);
    }
  };

  const handleNewBranchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateBranch();
    } else if (e.key === 'Escape') {
      setShowNewBranchInput(false);
      setNewBranchName('');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-200">Branches</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-800">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search branches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Branch list */}
        <div className="flex-1 overflow-y-auto">
          {filteredBranches.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">
              {searchQuery ? 'No branches found' : 'No branches'}
            </div>
          ) : (
            <div className="py-2">
              {filteredBranches.map((branch) => {
                const isCurrent = branch === currentBranch;
                return (
                  <button
                    key={branch}
                    onClick={() => {
                      if (!isCurrent) {
                        onCheckout(branch);
                        onClose();
                      }
                    }}
                    className={
                      'w-full px-4 py-2 flex items-center justify-between hover:bg-gray-800 transition-colors text-left' +
                      (isCurrent ? ' bg-gray-800' : '')
                    }
                    disabled={isCurrent}
                  >
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-gray-400" />
                      <span className={'text-gray-200' + (isCurrent ? ' font-medium' : '')}>
                        {branch}
                      </span>
                    </div>
                    {isCurrent && <Check className="w-4 h-4 text-green-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* New branch input */}
        {showNewBranchInput ? (
          <div className="px-4 py-3 border-t border-gray-800">
            <div className="flex items-center gap-2">
              <input
                ref={newBranchInputRef}
                type="text"
                placeholder="Branch name..."
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={handleNewBranchKeyDown}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || branches.includes(newBranchName.trim())}
                className={
                  'p-2 rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed' +
                  (newBranchName.trim() && !branches.includes(newBranchName.trim()) ? '' : '')
                }
              >
                <Check className="w-4 h-4 text-green-500" />
              </button>
              <button
                onClick={() => {
                  setShowNewBranchInput(false);
                  setNewBranchName('');
                }}
                className="p-2 rounded hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-gray-800">
            <button
              onClick={() => {
                setShowNewBranchInput(true);
                setTimeout(() => {
                  newBranchInputRef.current?.focus();
                }, 100);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Branch</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
