'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/* ── Synapse logo scramble config (matches marketing preloader) ────────── */
const DISPLAY_CHARS = ['S', 'Y', 'N', '\u039B', 'P', 'S', 'E'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const PIXEL_FONTS = [
  'font-pixel-circle',
  'font-pixel-grid',
  'font-pixel-triangle',
  'font-pixel-line',
];
const LANDED_FONT = 'font-pixel-circle';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface LetterState {
  char: string;
  font: string;
  settled: boolean;
}

/**
 * Full-screen login transition overlay.
 *
 * Activates when `?signed_in=1` is in the URL (set by AuthModal after
 * successful login/signup). Plays the Synapse logo scramble animation,
 * shows a welcome toast, then fades out to reveal the page underneath.
 *
 * Once dismissed, it removes the query param from the URL so refreshing
 * won't replay the animation.
 */
export function LoginTransition() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const shouldShow = searchParams.get('signed_in') === '1';

  const [visible, setVisible] = useState(shouldShow);
  const [phase, setPhase] = useState<'scramble' | 'reveal' | 'toast' | 'wipe'>(
    'scramble',
  );
  const [letters, setLetters] = useState<LetterState[]>(() =>
    DISPLAY_CHARS.map(() => ({
      char: pick(SCRAMBLE_POOL),
      font: pick(PIXEL_FONTS),
      settled: false,
    })),
  );
  const [revealProgress, setRevealProgress] = useState(0);
  const rafRef = useRef(0);

  // Clean up query param once we've captured shouldShow
  const cleanedRef = useRef(false);
  useEffect(() => {
    if (!shouldShow || cleanedRef.current) return;
    cleanedRef.current = true;
    // Remove signed_in param without triggering a full navigation
    const params = new URLSearchParams(searchParams.toString());
    params.delete('signed_in');
    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    window.history.replaceState(null, '', newUrl);
  }, [shouldShow, searchParams, pathname]);

  // If URL doesn't have the flag, bail early
  if (!shouldShow && !visible) return null;

  return (
    <LoginTransitionInner
      visible={visible}
      setVisible={setVisible}
      phase={phase}
      setPhase={setPhase}
      letters={letters}
      setLetters={setLetters}
      revealProgress={revealProgress}
      setRevealProgress={setRevealProgress}
      rafRef={rafRef}
    />
  );
}

/* ── Inner component (avoids hook-order issues with early returns) ───── */

interface InnerProps {
  visible: boolean;
  setVisible: (v: boolean) => void;
  phase: 'scramble' | 'reveal' | 'toast' | 'wipe';
  setPhase: (p: 'scramble' | 'reveal' | 'toast' | 'wipe') => void;
  letters: LetterState[];
  setLetters: React.Dispatch<React.SetStateAction<LetterState[]>>;
  revealProgress: number;
  setRevealProgress: (n: number) => void;
  rafRef: React.MutableRefObject<number>;
}

function LoginTransitionInner({
  visible,
  setVisible,
  phase,
  setPhase,
  letters,
  setLetters,
  revealProgress,
  setRevealProgress,
  rafRef,
}: InnerProps) {
  // ── Phase 1: Scramble ─────────────────────────────────────────────
  useEffect(() => {
    if (!visible || phase !== 'scramble') return;

    let tick = 0;
    const settleTicks = DISPLAY_CHARS.map((_, i) => 6 + i * 2);

    const id = setInterval(() => {
      tick++;
      setLetters((prev) =>
        prev.map((letter, i) => {
          if (letter.settled) return letter;
          if (tick >= settleTicks[i]) {
            return { char: DISPLAY_CHARS[i], font: LANDED_FONT, settled: true };
          }
          return {
            char: pick(SCRAMBLE_POOL),
            font: pick(PIXEL_FONTS),
            settled: false,
          };
        }),
      );

      if (tick > Math.max(...settleTicks)) {
        clearInterval(id);
        setTimeout(() => setPhase('reveal'), 150);
      }
    }, 55);

    return () => clearInterval(id);
  }, [visible, phase, setLetters, setPhase]);

  // ── Phase 2: Clip-path reveal to solid Geist ──────────────────────
  useEffect(() => {
    if (phase !== 'reveal') return;

    const duration = 450;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setRevealProgress(progress);

      if (progress < 100) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setTimeout(() => setPhase('toast'), 200);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, setRevealProgress, setPhase, rafRef]);

  // ── Phase 3: Toast hold ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'toast') return;
    const t = setTimeout(() => setPhase('wipe'), 1200);
    return () => clearTimeout(t);
  }, [phase, setPhase]);

  // ── Phase 4: Wipe — dismiss overlay ───────────────────────────────
  useEffect(() => {
    if (phase !== 'wipe') return;
    const t = setTimeout(() => setVisible(false), 650);
    return () => clearTimeout(t);
  }, [phase, setVisible]);

  const isDone = phase === 'reveal' && revealProgress >= 100;
  const showBack = phase === 'scramble' || (phase === 'reveal' && !isDone);
  const showFront = phase === 'reveal' || phase === 'toast' || phase === 'wipe';
  const showToast = phase === 'toast' || phase === 'wipe';

  const CELL = 'inline-block w-[0.85em] text-center';

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#0a0a0a]"
          initial={false}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Subtle green glow */}
          <div
            className="absolute w-[50vmax] h-[50vmax] rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(40,205,86,0.06) 0%, transparent 60%)',
            }}
          />

          {/* Logo scramble → reveal */}
          <span className="relative inline-flex text-4xl md:text-5xl lg:text-6xl tracking-[0.2em] uppercase font-normal text-white z-10">
            {/* Back layer: pixel font scramble */}
            {showBack && (
              <span className="inline-flex" aria-hidden="true">
                {letters.map((letter, i) => (
                  <span
                    key={i}
                    className={`${CELL} ${letter.font} pixel-stipple`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {letter.char}
                  </span>
                ))}
              </span>
            )}

            {/* Front layer: solid Geist Sans */}
            {showFront && (
              <span
                className={`${
                  isDone || phase === 'toast' || phase === 'wipe'
                    ? 'relative'
                    : 'absolute inset-0'
                } inline-flex`}
                style={
                  isDone || phase === 'toast' || phase === 'wipe'
                    ? undefined
                    : { clipPath: `inset(0 ${100 - revealProgress}% 0 0)` }
                }
              >
                {DISPLAY_CHARS.map((ch, i) => (
                  <span
                    key={i}
                    className={CELL}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {ch}
                  </span>
                ))}
              </span>
            )}
          </span>

          {/* Toast message */}
          <AnimatePresence>
            {showToast && (
              <motion.p
                className="mt-8 text-sm text-gray-400 z-10"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-[#28cd56]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Signed in successfully
                </span>
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
