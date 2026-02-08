'use client';

import { ResourcePicker } from './ResourcePicker';
import type { PreviewResource } from '@/lib/types/preview';

interface CollectionPickerProps {
  projectId: string;
  onSelect: (resource: PreviewResource) => void;
}

export function CollectionPicker({ projectId, onSelect }: CollectionPickerProps) {
  return (
    <ResourcePicker
      projectId={projectId}
      type="collection"
      label="Collections"
      onSelect={onSelect}
    />
  );
}
