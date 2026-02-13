'use client';

import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface UsageLimitBannerProps {
  message: string;
  onUpgrade?: () => void;
  onEnableOnDemand?: () => void;
}

/**
 * Amber warning banner shown when a user hits their plan's usage limit.
 * Provides quick links to upgrade or enable on-demand billing.
 */
export function UsageLimitBanner({
  message,
  onUpgrade,
  onEnableOnDemand,
}: UsageLimitBannerProps) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />

      <p className="flex-1 text-sm text-amber-200">{message}</p>

      <div className="flex items-center gap-2 shrink-0">
        {onEnableOnDemand && (
          <Link
            href="/account/spending"
            onClick={(e) => {
              if (onEnableOnDemand) {
                e.preventDefault();
                onEnableOnDemand();
              }
            }}
            className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
          >
            Enable On-Demand
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}

        <Link
          href="/account/billing"
          onClick={(e) => {
            if (onUpgrade) {
              e.preventDefault();
              onUpgrade();
            }
          }}
          className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-amber-400"
        >
          Upgrade Plan
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
