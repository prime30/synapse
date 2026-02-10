'use client';

import { useState, useEffect, useRef } from 'react';

/** Display characters: Lambda (\u039B) replaces A for a crossbar-free glyph */
const DISPLAY_CHARS = ['S', 'Y', 'N', '\u039B', 'P', 'S', 'E'];
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const PIXEL_FONTS = [
  'font-pixel-circle',
  'font-pixel-grid',
  'font-pixel-triangle',
  'font-pixel-line',
];
const LANDED_FONT = 'font-pixel-circle';

const STIPPLE_SIZES = ['2px 2px', '2.5px 2.5px', '3px 3px', '3.5px 3.5px'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickDeterministic<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length];
}

interface LetterState {
  char: string;
  font: string;
  settled: boolean;
}

function initialLetters(): LetterState[] {
  return DISPLAY_CHARS.map((_, i) => ({
    // Deterministic initial state avoids SSR/client hydration mismatches.
    char: SCRAMBLE_POOL[(i * 7 + 3) % SCRAMBLE_POOL.length],
    font: pickDeterministic(PIXEL_FONTS, i),
    settled: false,
  }));
}

const LETTER_CELL = 'inline-block w-[0.85em] text-center leading-none';

export function SynapseLogo({ className }: { className?: string }) {
  const [letters, setLetters] = useState<LetterState[]>(initialLetters);
  const [phase, setPhase] = useState<'scramble' | 'reveal' | 'done'>('scramble');
  const [maskSize, setMaskSize] = useState('2.5px 2.5px');
  const [revealProgress, setRevealProgress] = useState(0);
  const rafRef = useRef<number>(0);

  // ── Phase 1: Scramble — fast ticks, tight left-to-right stagger ────
  useEffect(() => {
    if (phase !== 'scramble') return;

    let tick = 0;
    // S settles at tick 6, Y at 8, N at 10, Λ at 12, P at 14, S at 16, E at 18
    // At 60ms per tick: S at 360ms, E at 1080ms — ~1.1s total scramble
    const settleTicks = DISPLAY_CHARS.map((_, i) => 6 + i * 2);

    const id = setInterval(() => {
      tick++;

      setMaskSize(pick(STIPPLE_SIZES));

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
        })
      );

      const maxSettle = Math.max(...settleTicks);
      if (tick > maxSettle) {
        clearInterval(id);
        setMaskSize('2.5px 2.5px');
        setTimeout(() => setPhase('reveal'), 200);
      }
    }, 60);

    return () => clearInterval(id);
  }, [phase]);

  // ── Phase 2: Clip-path reveal — solid Geist sweeps left-to-right ───
  useEffect(() => {
    if (phase !== 'reveal') return;

    const duration = 500; // ms
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setRevealProgress(progress);

      if (progress < 100) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPhase('done');
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  const isDone = phase === 'done';
  const showBackLayer = !isDone;
  const showFrontLayer = phase === 'reveal' || isDone;

  return (
    <span
      className={`relative inline-flex items-center text-base tracking-[0.2em] uppercase font-normal ${className ?? ''}`}
      aria-label="Synapse"
    >
      {/* Invisible sizer: keeps the wrapper a stable size regardless of phase */}
      <span className="inline-flex invisible pointer-events-none" aria-hidden="true">
        {DISPLAY_CHARS.map((ch, i) => (
          <span
            key={i}
            className={LETTER_CELL}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {ch}
          </span>
        ))}
      </span>

      {/* Back layer: stippled pixel font text */}
      {showBackLayer && (
        <span className="absolute inset-0 inline-flex items-center">
          {letters.map((letter, i) => (
            <span
              key={i}
              className={`${LETTER_CELL} ${letter.font} pixel-stipple`}
              style={{
                fontVariantNumeric: 'tabular-nums',
                WebkitMaskSize: maskSize,
                maskSize,
              }}
            >
              {letter.char}
            </span>
          ))}
        </span>
      )}

      {/* Front layer: solid Geist Sans, revealed via clip-path */}
      {showFrontLayer && (
        <span
          className="absolute inset-0 inline-flex items-center"
          style={
            isDone
              ? undefined
              : { clipPath: `inset(0 ${100 - revealProgress}% 0 0)` }
          }
        >
          {DISPLAY_CHARS.map((ch, i) => (
            <span
              key={i}
              className={LETTER_CELL}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {ch}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
