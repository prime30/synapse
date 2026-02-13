'use client';

import type { PreviewPageType } from '@/lib/types/preview';

const PAGE_TYPES: Array<{ label: string; value: PreviewPageType }> = [
  { label: 'Home', value: 'home' },
  { label: 'Product', value: 'product' },
  { label: 'Collection', value: 'collection' },
  { label: 'Cart', value: 'cart' },
  { label: 'Blog', value: 'blog' },
  { label: 'Page', value: 'page' },
  { label: '404', value: 'not_found' },
];

interface PageTypeSelectorProps {
  value: PreviewPageType;
  onChange: (value: PreviewPageType) => void;
}

export function PageTypeSelector({ value, onChange }: PageTypeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PAGE_TYPES.map((type) => (
        <button
          key={type.value}
          type="button"
          onClick={() => onChange(type.value)}
          className={`rounded px-3 py-1 text-xs ${value === type.value ? 'bg-sky-500 dark:bg-sky-600 text-white' : 'ide-surface-input ide-text-2 hover:ide-text ide-hover'}`}
        >
          {type.label}
        </button>
      ))}
    </div>
  );
}
