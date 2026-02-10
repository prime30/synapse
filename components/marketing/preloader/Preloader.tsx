'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useMarkPageReady } from '@/components/marketing/PreloaderContext';

const DISPLAY_CHARS = ['S', 'Y', 'N', '\u039B', 'P', 'S', 'E'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const PIXEL_FONTS = [
  'font-pixel-circle',
  'font-pixel-grid',
  'font-pixel-triangle',
  'font-pixel-line',
];
const LANDED_FONT = 'font-pixel-circle';
const PRELOADER_KEY = 'synapse_preloader_done_v2';

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface LetterState {
  char: string;
  font: string;
  settled: boolean;
}

export function Preloader() {
  const pathname = usePathname();
  const markReady = useMarkPageReady();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [letters, setLetters] = useState<LetterState[]>(() =>
    DISPLAY_CHARS.map(() => ({
      char: pick(SCRAMBLE_POOL),
      font: pick(PIXEL_FONTS),
      settled: false,
    })),
  );
  const [phase, setPhase] = useState<'scramble' | 'reveal' | 'wipe'>('scramble');
  const [revealProgress, setRevealProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Skip if already seen this session. On home page the Preloader only mounts on full page load
  // (initial or hard refresh), so clear the flag when we're on home so the preloader always shows.
  useEffect(() => {
    if (!mounted) return;
    const isHome = pathname === '/' || (typeof window !== 'undefined' && window.location.pathname === '/');
    if (isHome) {
      sessionStorage.removeItem(PRELOADER_KEY);
    }
    const done = sessionStorage.getItem(PRELOADER_KEY);
    if (done === '1') {
      setVisible(false);
      markReady();
    }
  }, [mounted, pathname, markReady]);

  // ── Phase 1: Scramble — same as SynapseLogo header ──────────────
  useEffect(() => {
    if (!mounted || !visible || phase !== 'scramble') return;

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
        setTimeout(() => setPhase('reveal'), 200);
      }
    }, 60);

    return () => clearInterval(id);
  }, [mounted, visible, phase]);

  // ── Phase 2: Clip-path reveal to solid ──────────────────────────
  useEffect(() => {
    if (phase !== 'reveal') return;

    const duration = 500;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setRevealProgress(progress);

      if (progress < 100) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Hold for a beat, then wipe out
        setTimeout(() => setPhase('wipe'), 400);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // ── Phase 3: Wipe — dismiss preloader ───────────────────────────
  useEffect(() => {
    if (phase !== 'wipe') return;
    const t = setTimeout(() => {
      sessionStorage.setItem(PRELOADER_KEY, '1');
      setVisible(false);
      markReady();
    }, 600);
    return () => clearTimeout(t);
  }, [phase]);

  if (!mounted) return null;

  const isDone = phase === 'reveal' && revealProgress >= 100;
  const showBack = phase === 'scramble' || (phase === 'reveal' && !isDone);
  const showFront = phase === 'reveal' || phase === 'wipe';

  const CELL = 'inline-block w-[0.85em] text-center';

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#fafaf9]"
          initial={false}
          exit={{ clipPath: 'inset(0 0 100% 0)' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Subtle green glow behind logo */}
          <div
            className="absolute w-[50vmax] h-[50vmax] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(40,205,86,0.08) 0%, transparent 60%)',
            }}
          />

          {/* Logo — scramble + reveal, same as header */}
          <span className="relative inline-flex text-4xl md:text-5xl lg:text-6xl tracking-[0.2em] uppercase font-normal text-stone-900 z-10">
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

            {/* Front layer: solid Geist Sans, clip-path reveal */}
            {showFront && (
              <span
                className={`${isDone || phase === 'wipe' ? 'relative' : 'absolute inset-0'} inline-flex`}
                style={
                  isDone || phase === 'wipe'
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
