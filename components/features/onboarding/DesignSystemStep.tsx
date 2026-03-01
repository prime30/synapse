'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/marketing/glass/GlassCard';
import { ColorRampStrip } from '@/components/features/design-system/ColorRampStrip';
import { ButtonSystemSection } from '@/components/features/design-system/ButtonSystemSection';

interface DesignSystemStepProps {
  projectId: string | null;
  onNext: () => void;
  onBack: () => void;
}

interface TokenSummary {
  colors: string[];
  fonts: string[];
  fontSizes: string[];
  spacing: string[];
  radii: string[];
  shadows: string[];
  animation?: string[];
}

interface ColorRampEntry {
  step: number;
  hex: string;
  contrastOnWhite?: number;
  contrastOnBlack?: number;
}

interface TokenData {
  tokens: TokenSummary;
  ramps?: Record<string, ColorRampEntry[]>;
  tokenCount: number;
  fileCount: number;
  analyzedFiles: string[];
  framework?: string;
  componentCount?: number;
}

type PollState = 'polling' | 'ready' | 'empty' | 'error';

const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

function ColorSwatch({ color }: { color: string }) {
  return (
    <div
      className="w-7 h-7 rounded-md border border-stone-200 dark:border-white/10 shrink-0"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function TypeIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function SpacingIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path d="M6 2v2" /><path d="M6 20v2" />
      <path d="M18 2v2" /><path d="M18 20v2" />
      <path d="M2 6h2" /><path d="M20 6h2" />
      <path d="M2 18h2" /><path d="M20 18h2" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
    </svg>
  );
}

export function DesignSystemStep({ projectId, onNext, onBack }: DesignSystemStepProps) {
  const [pollState, setPollState] = useState<PollState>(projectId ? 'polling' : 'empty');
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTokens = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens`);
      if (!res.ok) return false;
      const json = await res.json();
      const payload: TokenData = json.data ?? json;
      if (payload.tokenCount > 0) {
        setTokenData(payload);
        setPollState('ready');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || pollState !== 'polling') return;

    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      attemptRef.current += 1;
      const found = await fetchTokens();
      if (cancelled) return;

      if (!found && attemptRef.current < MAX_POLL_ATTEMPTS) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } else if (!found) {
        setPollState('empty');
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, pollState, fetchTokens]);

  const handleScan = useCallback(async () => {
    if (!projectId) return;
    setIsScanning(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/scan`, { method: 'POST' });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) {
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n').filter(Boolean);
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const evt = JSON.parse(line.slice(6));
                  if (evt.phase === 'complete' && evt.data) {
                    setTokenData(evt.data);
                    setPollState('ready');
                  }
                } catch { /* skip parse errors in stream */ }
              }
            }
          }
        }
      }

      if (pollState !== 'ready') {
        const found = await fetchTokens();
        if (!found) setPollState('empty');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setPollState('error');
    } finally {
      setIsScanning(false);
    }
  }, [projectId, pollState, fetchTokens]);

  if (!projectId) {
    return (
      <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
        <motion.h2
          className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-white"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Design System
        </motion.h2>
        <motion.p
          className="mt-3 text-sm ide-text-muted leading-relaxed max-w-lg"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          Import a theme first to extract your design system.
        </motion.p>
        <motion.button
          type="button"
          onClick={onNext}
          className="mt-8 inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm transition-all"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          Continue
        </motion.button>
      </div>
    );
  }

  const tokens = tokenData?.tokens;
  const isPolling = pollState === 'polling' || isScanning;

  return (
    <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
      <motion.h2
        className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Your Design System
      </motion.h2>

      <motion.p
        className="mt-3 text-sm ide-text-muted leading-relaxed max-w-lg"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      >
        {isPolling
          ? 'Analyzing your theme files for design tokens...'
          : pollState === 'ready'
            ? `Found ${tokenData?.tokenCount ?? 0} design tokens across ${tokenData?.fileCount ?? 0} files.`
            : 'No design tokens found yet. Run a scan to extract them from your theme.'}
      </motion.p>

      {isPolling && (
        <motion.div
          className="mt-6 flex items-center gap-3 text-sm ide-text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <SpinnerIcon className="w-5 h-5 text-emerald-500" />
          <span>{isScanning ? 'Scanning theme files...' : 'Waiting for tokens...'}</span>
        </motion.div>
      )}

      {pollState === 'ready' && tokens && (
        <motion.div
          className="mt-6 w-full grid grid-cols-1 sm:grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Colors */}
          <GlassCard padding="sm" theme="light">
            <div className="flex flex-col items-start gap-2 text-left">
              <div className="text-pink-400"><PaletteIcon /></div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
                Colors <span className="text-xs font-normal ide-text-muted">({tokens.colors.length})</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tokens.colors.slice(0, 12).map((c, i) => (
                  <ColorSwatch key={`${c}-${i}`} color={c} />
                ))}
                {tokens.colors.length > 12 && (
                  <span className="text-[10px] ide-text-quiet self-end">+{tokens.colors.length - 12}</span>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Typography */}
          <GlassCard padding="sm" theme="light">
            <div className="flex flex-col items-start gap-2 text-left">
              <div className="text-sky-400"><TypeIcon /></div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
                Typography <span className="text-xs font-normal ide-text-muted">({tokens.fonts.length + tokens.fontSizes.length})</span>
              </h3>
              <div className="space-y-1">
                {tokens.fonts.slice(0, 3).map((f, i) => (
                  <p key={`${f}-${i}`} className="text-xs ide-text-muted truncate max-w-full" title={f}>{f}</p>
                ))}
                {tokens.fontSizes.length > 0 && (
                  <p className="text-[10px] ide-text-quiet">{tokens.fontSizes.length} size tokens</p>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Spacing + Borders + Shadows */}
          <GlassCard padding="sm" theme="light">
            <div className="flex flex-col items-start gap-2 text-left">
              <div className="text-amber-400"><SpacingIcon /></div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
                Structure <span className="text-xs font-normal ide-text-muted">({tokens.spacing.length + tokens.radii.length + tokens.shadows.length + (tokens.animation?.length ?? 0)})</span>
              </h3>
              <div className="space-y-1">
                {tokens.spacing.length > 0 && (
                  <p className="text-xs ide-text-muted">{tokens.spacing.length} spacing values</p>
                )}
                {tokens.radii.length > 0 && (
                  <p className="text-xs ide-text-muted">{tokens.radii.length} border radii</p>
                )}
                {tokens.shadows.length > 0 && (
                  <p className="text-xs ide-text-muted">{tokens.shadows.length} shadows</p>
                )}
                {(tokens.animation?.length ?? 0) > 0 && (
                  <p className="text-xs ide-text-muted">{tokens.animation!.length} animations</p>
                )}
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Ramp previews when available */}
      {pollState === 'ready' && tokenData?.ramps && Object.keys(tokenData.ramps).length > 0 && (
        <motion.div
          className="mt-4 w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-3">Color Ramps</h3>
          <div className="flex flex-wrap gap-6">
            {Object.entries(tokenData.ramps).map(([name, entries]) => (
              <ColorRampStrip
                key={name}
                brandName={name}
                entries={entries}
                baseStep={500}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Button system preview when available */}
      {pollState === 'ready' && projectId && (
        <motion.div
          className="mt-4 w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <ButtonSystemSection projectId={projectId} />
        </motion.div>
      )}

      {error && (
        <motion.p
          className="mt-4 text-xs text-red-500 dark:text-red-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.p>
      )}

      {/* Actions */}
      <motion.div
        className="mt-8 flex flex-col sm:flex-row items-center gap-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: pollState === 'ready' ? 0.3 : 0.1 }}
      >
        {pollState === 'empty' && (
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm transition-all disabled:opacity-50"
          >
            {isScanning ? <SpinnerIcon className="w-4 h-4" /> : null}
            Scan Theme
          </button>
        )}

        {pollState === 'ready' && (
          <>
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm transition-all shadow-[0_0_20px_oklch(0.696_0.17_162_/_0.3)] hover:shadow-[0_0_30px_oklch(0.696_0.17_162_/_0.5)]"
            >
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning}
              className="text-xs ide-text-muted hover:text-stone-600 dark:hover:text-white/70 transition-colors disabled:opacity-50"
            >
              Re-scan
            </button>
          </>
        )}

        {pollState === 'error' && (
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm transition-all disabled:opacity-50"
          >
            Retry Scan
          </button>
        )}

        {pollState !== 'ready' && (
          <button
            type="button"
            onClick={onNext}
            className="text-xs ide-text-muted hover:text-stone-600 dark:hover:text-white/70 transition-colors"
          >
            Skip for now
          </button>
        )}
      </motion.div>

      <motion.p
        className="mt-3 text-xs ide-text-quiet"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        You can review and edit your design system anytime from the Design System page.
      </motion.p>
    </div>
  );
}
