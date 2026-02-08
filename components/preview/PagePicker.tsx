'use client';

import { ResourcePicker } from './ResourcePicker';
import type { PreviewResource } from '@/lib/types/preview';

interface PagePickerProps {
  projectId: string;
  onSelect: (resource: PreviewResource) => void;
}

export function PagePicker({ projectId, onSelect }: PagePickerProps) {
  return (
    <ResourcePicker
      projectId={projectId}
      type="page"
      label="Pages"
      onSelect={onSelect}
    />
  );
}
