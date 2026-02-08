'use client';

import type { PreviewPageType } from '@/lib/types/preview';
import { DeviceSizeSelector } from './DeviceSizeSelector';
import { PageTypeSelector } from './PageTypeSelector';

interface PreviewControlsProps {
  deviceWidth: number;
  pageType: PreviewPageType;
  onDeviceWidthChange: (width: number) => void;
  onPageTypeChange: (type: PreviewPageType) => void;
}

export function PreviewControls({
  deviceWidth,
  pageType,
  onDeviceWidthChange,
  onPageTypeChange,
}: PreviewControlsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div>
        <p className="text-xs font-semibold text-gray-300 mb-2">Device size</p>
        <DeviceSizeSelector value={deviceWidth} onChange={onDeviceWidthChange} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-300 mb-2">Page type</p>
        <PageTypeSelector value={pageType} onChange={onPageTypeChange} />
      </div>
    </div>
  );
}
