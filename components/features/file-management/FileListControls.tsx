'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { FileType } from '@/lib/types/files';

type SortOption = 'name' | 'type' | 'size' | 'date';

interface FileListControlsProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  filter: FileType | 'all';
  onFilterChange: (value: FileType | 'all') => void;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Size' },
  { value: 'date', label: 'Date Modified' },
];

const FILTER_OPTIONS: { value: FileType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'css', label: 'CSS' },
];

export function FileListControls({
  search,
  onSearchChange,
  sort,
  onSortChange,
  filter,
  onFilterChange,
}: FileListControlsProps) {
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => onSearchChange(localSearch), 300);
    return () => clearTimeout(t);
  }, [localSearch, onSearchChange]);

  return (
    <div className="space-y-2 p-2 border-b ide-border">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 ide-text-muted h-4 w-4" aria-hidden />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search files..."
          className="w-full pl-8 pr-2 py-1.5 text-sm ide-input"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onFilterChange(opt.value)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              filter === opt.value
                ? 'bg-sky-500 text-white'
                : 'ide-surface-panel ide-text-muted ide-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="w-full px-2 py-1 text-sm ide-input"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            Sort: {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
