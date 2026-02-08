'use client';

import { ResourcePicker } from './ResourcePicker';
import type { PreviewResource } from '@/lib/types/preview';

interface ProductPickerProps {
  projectId: string;
  onSelect: (resource: PreviewResource) => void;
}

export function ProductPicker({ projectId, onSelect }: ProductPickerProps) {
  return (
    <ResourcePicker
      projectId={projectId}
      type="product"
      label="Products"
      onSelect={onSelect}
    />
  );
}
