'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useActiveStore } from '@/hooks/useActiveStore';
import { GlassCard } from '@/components/marketing/glass/GlassCard';

// ── Required Scopes ──────────────────────────────────────────────────────────

const REQUIRED_SCOPES = [
  'read_themes',
  'write_themes',
  'read_content',
  'write_content',
  'read_products',
  'read_inventory',
  'read_files',
  'write_files',
  'read_online_store_navigation',
  'write_online_store_navigation',
  'read_discounts',
  'write_discounts',
] as const;

// ── Setup Steps (for the advanced manual flow) ──────────────────────────────

const SETUP_STEPS = [
  {
    number: 1,
    text: 'Go to your Shopify Admin',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    ),
  },
  {
    number: 2,
    text: 'Settings → Apps and sales channels → Develop apps',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    ),
  },
  {
    number: 3,
    text: 'Create an app → Configure Admin API scopes',
    icon: null,
  },
  {
    number: 4,
    text: 'Enable these scopes:',
    icon: null,
    showScopes: true,
  },
  {
    number: 5,
    text: 'Install the app and copy the Admin API access token',
    icon: null,
  },
] as const;

// ── Shopify Logo Icon ────────────────────────────────────────────────────────

/** Official Shopify bag icon (monotone, from brand assets). Uses currentColor. */
function ShopifyIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 109.5 124.5"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M74.8,14.8c0,0-1.4,0.4-3.7,1.1c-0.4-1.3-1-2.8-1.8-4.4c-2.6-5-6.5-7.7-11.1-7.7c0,0,0,0,0,0 c-0.3,0-0.6,0-1,0.1c-0.1-0.2-0.3-0.3-0.4-0.5c-2-2.2-4.6-3.2-7.7-3.1c-6,0.2-12,4.5-16.8,12.2c-3.4,5.4-6,12.2-6.7,17.5 c-6.9,2.1-11.7,3.6-11.8,3.7c-3.5,1.1-3.6,1.2-4,4.5c-0.3,2.5-9.5,72.9-9.5,72.9l75.6,13.1V14.7C75.3,14.7,75,14.8,74.8,14.8z M57.3,20.2c-4,1.2-8.4,2.6-12.7,3.9c1.2-4.7,3.6-9.4,6.4-12.5c1.1-1.1,2.6-2.4,4.3-3.2C57,12,57.4,16.9,57.3,20.2z M49.1,4.4 c1.4,0,2.6,0.3,3.6,0.9c-1.6,0.8-3.2,2.1-4.7,3.6c-3.8,4.1-6.7,10.5-7.9,16.6c-3.6,1.1-7.2,2.2-10.5,3.2 C31.8,19.1,39.9,4.6,49.1,4.4z M37.5,59.4c0.4,6.4,17.3,7.8,18.3,22.9c0.7,11.9-6.3,20-16.4,20.6c-12.2,0.8-18.9-6.4-18.9-6.4 l2.6-11c0,0,6.7,5.1,12.1,4.7c3.5-0.2,4.8-3.1,4.7-5.1c-0.5-8.4-14.3-7.9-15.2-21.7C23.9,51.8,31.5,40.1,48.3,39 c6.5-0.4,9.8,1.2,9.8,1.2l-3.8,14.4c0,0-4.3-2-9.4-1.6C37.5,53.5,37.4,58.2,37.5,59.4z M61.3,19c0-3-0.4-7.3-1.8-10.9 c4.6,0.9,6.8,6,7.8,9.1C65.5,17.7,63.5,18.3,61.3,19z" />
      <path d="M78.2,124l31.4-7.8c0,0-13.5-91.3-13.6-91.9c-0.1-0.6-0.6-1-1.1-1c-0.5,0-9.3-0.2-9.3-0.2s-5.4-5.2-7.4-7.2 V124z" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface ConnectStoreStepProps {
  onConnected: () => void;
  onBack: () => void;
}

export function ConnectStoreStep({ onConnected, onBack: _onBack }: ConnectStoreStepProps) {
  const { connectStore, isConnecting, connectError } = useActiveStore();

  const [storeDomain, setStoreDomain] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-advance after success (manual token path)
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => onConnected(), 1500);
    return () => clearTimeout(timer);
  }, [success, onConnected]);

  // ── OAuth path ──────────────────────────────────────────────────────
  const oauthDomain = storeDomain.trim().replace(/\.myshopify\.com$/, '');
  const oauthUrl = oauthDomain
    ? `/api/shopify/install?shop=${encodeURIComponent(`${oauthDomain}.myshopify.com`)}`
    : null;

  // ── Manual token path ───────────────────────────────────────────────
  const handleManualConnect = useCallback(async () => {
    setError(null);

    const domain = storeDomain.trim().replace(/\.myshopify\.com$/, '');
    if (!domain) {
      setError('Please enter your store domain.');
      return;
    }
    if (!adminToken.trim()) {
      setError('Please enter your Admin API access token.');
      return;
    }

    try {
      await connectStore({
        storeDomain: `${domain}.myshopify.com`,
        adminApiToken: adminToken.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to connect store.',
      );
    }
  }, [storeDomain, adminToken, connectStore]);

  const displayError = error ?? (connectError ? connectError.message : null);

  return (
    <div className="flex flex-col items-center max-w-lg mx-auto w-full">
      {/* Heading */}
      <motion.h2
        className="text-2xl font-bold text-stone-900 dark:text-white text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        Connect your Shopify store
      </motion.h2>
      <motion.p
        className="mt-2 text-sm ide-text-muted text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        One click to authorize Synapse to access your theme files.
      </motion.p>

      {/* Success state */}
      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            className="flex flex-col items-center gap-3 py-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <motion.div
              className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>
            <p className="text-sm font-medium text-emerald-400">
              Store connected!
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            className="w-full space-y-4 mt-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {/* Store domain input */}
            <div>
              <label
                htmlFor="store-domain"
                className="block text-xs font-medium ide-text-muted mb-1.5"
              >
                Store domain
              </label>
              <div className="flex">
                <input
                  id="store-domain"
                  type="text"
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  placeholder="your-store"
                  className="flex-1 min-w-0 rounded-l-lg ide-input text-sm"
                />
                <span className="inline-flex items-center rounded-r-lg border border-l-0 ide-border ide-surface-input px-3 text-xs ide-text-muted">
                  .myshopify.com
                </span>
              </div>
            </div>

            {/* Primary: Connect with Shopify (OAuth) */}
            <a
              href={oauthUrl ?? '#'}
              onClick={(e) => {
                if (!oauthUrl) {
                  e.preventDefault();
                  setError('Please enter your store domain first.');
                }
              }}
              className={`
                w-full inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-lg
                font-medium text-sm transition-all
                ${oauthUrl
                  ? 'bg-[#5E8E3E] hover:bg-[#4A7A2E] text-white shadow-[0_0_20px_rgba(94,142,62,0.25)] hover:shadow-[0_0_30px_rgba(94,142,62,0.4)]'
                  : 'bg-stone-200 dark:bg-white/10 ide-text-muted cursor-not-allowed'
                }
              `}
              aria-label="Connect with Shopify"
            >
              <ShopifyIcon />
              Connect with Shopify
            </a>

            <p className="text-center text-[11px] ide-text-quiet">
              You&apos;ll be redirected to Shopify to approve permissions, then sent back here.
            </p>

            {/* Error */}
            {displayError && (
              <motion.p
                className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {displayError}
              </motion.p>
            )}

            {/* Divider */}
            <div className="relative pt-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-stone-200 dark:border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#fafaf9] dark:bg-[#0a0a0a] px-2 ide-text-quiet">
                  or
                </span>
              </div>
            </div>

            {/* Advanced: Manual token entry (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-200 transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Advanced: Use an existing API token
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-4">
                      {/* Instructions */}
                      <GlassCard theme="light" padding="sm">
                        <div className="space-y-0">
                          {SETUP_STEPS.map((step, i) => (
                            <div key={step.number} className="flex gap-3">
                              {/* Number + vertical line */}
                              <div className="flex flex-col items-center">
                                <div className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                  {step.number}
                                </div>
                                {i < SETUP_STEPS.length - 1 && (
                                  <div className="w-px flex-1 bg-sky-500/20 my-1" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="pb-4 pt-0.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs ide-text-2 leading-relaxed">
                                    {step.text}
                                  </span>
                                  {step.icon && (
                                    <span className="text-sky-400 shrink-0">
                                      {step.icon}
                                    </span>
                                  )}
                                </div>

                                {/* Scope pills */}
                                {'showScopes' in step && step.showScopes && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {REQUIRED_SCOPES.map((scope) => (
                                      <span
                                        key={scope}
                                        className="inline-block px-2 py-0.5 text-[10px] font-mono rounded bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                      >
                                        {scope}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </GlassCard>

                      {/* Admin API token input */}
                      <div>
                        <label
                          htmlFor="admin-token"
                          className="block text-xs font-medium ide-text-muted mb-1.5"
                        >
                          Admin API access token
                        </label>
                        <input
                          id="admin-token"
                          type="password"
                          value={adminToken}
                          onChange={(e) => setAdminToken(e.target.value)}
                          placeholder="shpat_•••••••••••••••••••••••"
                          className="w-full rounded-lg ide-input text-sm"
                        />
                      </div>

                      {/* Manual connect button */}
                      <button
                        type="button"
                        onClick={handleManualConnect}
                        disabled={isConnecting}
                        className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-all shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_30px_rgba(14,165,233,0.5)]"
                      >
                        {isConnecting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Connecting…
                          </>
                        ) : (
                          <>
                            Connect with Token
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
