'use client';

import { Globe, ShoppingCart, User, Tag } from 'lucide-react';
import type { PreviewPageType } from '@/lib/types/preview';
import type { MockDataConfig } from '@/lib/preview/mock-data-provider';
import { DeviceSizeSelector } from './DeviceSizeSelector';

// ---------------------------------------------------------------------------
// Quick-select viewport widths
// ---------------------------------------------------------------------------

const VIEWPORT_PRESETS = [
  { label: '375', width: 375 },
  { label: '768', width: 768 },
  { label: '1024', width: 1024 },
  { label: 'Full', width: 0 },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PreviewControlsProps {
  deviceWidth: number;
  pageType: PreviewPageType;
  onDeviceWidthChange: (width: number) => void;
  onPageTypeChange: (type: PreviewPageType) => void;
  // Locale
  locale?: string;
  availableLocales?: { code: string; label: string }[];
  onLocaleChange?: (locale: string) => void;
  // Mock data
  mockConfig?: MockDataConfig;
  onMockConfigChange?: (config: MockDataConfig) => void;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionLabelClass = 'text-xs font-semibold ide-text-2 mb-2 flex items-center gap-1.5';
const selectClass =
  'w-full rounded ide-surface-input border ide-border px-2 py-1 text-xs ide-text focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewControls({
  deviceWidth,
  pageType,
  onDeviceWidthChange,
  onPageTypeChange,
  locale,
  availableLocales,
  onLocaleChange,
  mockConfig,
  onMockConfigChange,
}: PreviewControlsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border ide-border ide-surface-panel p-4">
      {/* ----------------------------------------------------------------- */}
      {/* Device size (existing) + quick-select viewport buttons            */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <p className="text-xs font-semibold ide-text-2 mb-2">Device size</p>
        <DeviceSizeSelector value={deviceWidth} onChange={onDeviceWidthChange} />
        <div className="flex items-center gap-1.5 mt-2">
          {VIEWPORT_PRESETS.map((vp) => (
            <button
              key={vp.label}
              type="button"
              onClick={() => onDeviceWidthChange(vp.width)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                deviceWidth === vp.width
                  ? 'bg-sky-500 dark:bg-sky-600 text-white'
                  : 'ide-surface-input ide-text-3 hover:ide-text-2 ide-hover'
              }`}
            >
              {vp.label === 'Full' ? 'Full' : `${vp.label}px`}
            </button>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Page type — TODO: wire up PageTypeSelector when PreviewControls   */}
      {/* is integrated (currently unused).                                 */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <p className="text-xs font-semibold ide-text-2 mb-2">Page type</p>
        <p className="text-xs ide-text-3">{pageType}</p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Locale selector                                                   */}
      {/* ----------------------------------------------------------------- */}
      {availableLocales && availableLocales.length > 0 && onLocaleChange && (
        <div>
          <p className={sectionLabelClass}>
            <Globe size={13} />
            Locale
          </p>
          <select
            value={locale ?? ''}
            onChange={(e) => onLocaleChange(e.target.value)}
            className={selectClass}
          >
            {availableLocales.map((loc) => (
              <option key={loc.code} value={loc.code}>
                {loc.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Mock data presets                                                 */}
      {/* ----------------------------------------------------------------- */}
      {mockConfig && onMockConfigChange && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold ide-text-2">Mock data</p>

          {/* Customer preset */}
          <div>
            <label className={sectionLabelClass}>
              <User size={13} />
              Customer
            </label>
            <select
              value={mockConfig.customer}
              onChange={(e) =>
                onMockConfigChange({
                  ...mockConfig,
                  customer: e.target.value as MockDataConfig['customer'],
                })
              }
              className={selectClass}
            >
              <option value="anonymous">Anonymous</option>
              <option value="logged-in">Logged-in</option>
              <option value="vip">VIP</option>
            </select>
          </div>

          {/* Cart preset */}
          <div>
            <label className={sectionLabelClass}>
              <ShoppingCart size={13} />
              Cart
            </label>
            <select
              value={mockConfig.cart}
              onChange={(e) =>
                onMockConfigChange({
                  ...mockConfig,
                  cart: e.target.value as MockDataConfig['cart'],
                })
              }
              className={selectClass}
            >
              <option value="empty">Empty</option>
              <option value="with-items">With items (3)</option>
              <option value="large-cart">Large cart (8+)</option>
            </select>
          </div>

          {/* Discount preset */}
          <div>
            <label className={sectionLabelClass}>
              <Tag size={13} />
              Discount
            </label>
            <select
              value={mockConfig.discount}
              onChange={(e) =>
                onMockConfigChange({
                  ...mockConfig,
                  discount: e.target.value as MockDataConfig['discount'],
                })
              }
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="percentage">Percentage (20%)</option>
              <option value="fixed-amount">Fixed amount ($10)</option>
              <option value="bogo">Buy one get one</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
