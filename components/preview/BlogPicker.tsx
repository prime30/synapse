'use client';

import { ResourcePicker } from './ResourcePicker';
import type { PreviewResource } from '@/lib/types/preview';

interface BlogPickerProps {
  projectId: string;
  onSelect: (resource: PreviewResource) => void;
}

export function BlogPicker({ projectId, onSelect }: BlogPickerProps) {
  return (
    <ResourcePicker
      projectId={projectId}
      type="blog"
      label="Blogs"
      onSelect={onSelect}
    />
  );
}
