'use client';

import { Store, UploadCloud, DownloadCloud, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface ShopifyOperation {
  type: 'push' | 'pull' | 'list_themes' | 'list_resources' | 'get_asset';
  status: 'pending' | 'success' | 'error';
  summary: string;
  detail?: string;
  error?: string;
}

interface ShopifyOperationCardProps {
  operations: ShopifyOperation[];
}

const OP_ICONS: Record<string, typeof Store> = {
  push: UploadCloud,
  pull: DownloadCloud,
  list_themes: Store,
  list_resources: Store,
  get_asset: Store,
};

const OP_LABELS: Record<string, string> = {
  push: 'Push to Shopify',
  pull: 'Pull from Shopify',
  list_themes: 'List Themes',
  list_resources: 'List Resources',
  get_asset: 'Get Asset',
};

export function ShopifyOperationCard({ operations }: ShopifyOperationCardProps) {
  if (operations.length === 0) return null;

  return (
    <div className="my-2 rounded-lg border ide-border ide-surface-inset overflow-hidden">
      <div className="px-3 py-2 border-b ide-border-subtle flex items-center gap-2">
        <Store className="w-3.5 h-3.5 ide-text-muted" />
        <span className="text-xs font-semibold ide-text-1">
          Shopify Operations ({operations.length})
        </span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {operations.map((op, i) => {
          const Icon = OP_ICONS[op.type] ?? Store;
          const statusColor =
            op.status === 'success'
              ? 'text-accent'
              : op.status === 'error'
                ? 'text-red-500 dark:text-red-400'
                : 'ide-text-muted animate-spin';

          return (
            <div key={i} className="flex items-start gap-2">
              <Icon className="w-3.5 h-3.5 ide-text-muted mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium ide-text-2">
                    {OP_LABELS[op.type] ?? op.type}
                  </span>
                  {op.status === 'pending' ? (
                    <Loader2 className={`w-3 h-3 ${statusColor}`} />
                  ) : op.status === 'success' ? (
                    <CheckCircle2 className={`w-3 h-3 ${statusColor}`} />
                  ) : (
                    <XCircle className={`w-3 h-3 ${statusColor}`} />
                  )}
                </div>
                <p className="text-[11px] ide-text-muted truncate">{op.summary}</p>
                {op.error && (
                  <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5">{op.error}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
