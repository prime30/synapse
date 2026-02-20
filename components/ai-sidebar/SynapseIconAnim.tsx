'use client';

import { useState, useEffect, useRef } from 'react';

const LAMBDA = '\u039B';
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

export function SynapseIconAnim({ size = 56 }: { size?: number }) {
  const [phase, setPhase] = useState<'scramble' | 'reveal' | 'done'>('scramble');
  const [scrambleChar, setScrambleChar] = useState(LAMBDA);
  const [scrambleFont, setScrambleFont] = useState(PIXEL_FONTS[0]);
  const [maskSize, setMaskSize] = useState('2.5px 2.5px');
  const [revealProgress, setRevealProgress] = useState(0);
  const [dotted, setDotted] = useState(false);
  const rafRef = useRef(0);

  // Phase 1: Scramble random chars then settle on Lambda
  useEffect(() => {
    if (phase !== 'scramble') return;
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      setMaskSize(pick(STIPPLE_SIZES));
      if (tick >= 10) {
        setScrambleChar(LAMBDA);
        setScrambleFont(LANDED_FONT);
        clearInterval(id);
        setTimeout(() => setPhase('reveal'), 150);
      } else {
        setScrambleChar(pick(SCRAMBLE_POOL));
        setScrambleFont(pick(PIXEL_FONTS));
      }
    }, 55);
    return () => clearInterval(id);
  }, [phase]);

  // Phase 2: Clip-path reveal — solid sweeps down
  useEffect(() => {
    if (phase !== 'reveal') return;
    const duration = 400;
    const start = performance.now();
    function animate(now: number) {
      const p = Math.min(((now - start) / duration) * 100, 100);
      setRevealProgress(p);
      if (p < 100) rafRef.current = requestAnimationFrame(animate);
      else setPhase('done');
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  // Phase 3: Periodic crossfade — solid white to green accent pixel dot
  useEffect(() => {
    if (phase !== 'done') return;
    let timeout: ReturnType<typeof setTimeout>;
    function schedule(d: boolean) {
      const dur = d ? 2000 + Math.random() * 1000 : 4000 + Math.random() * 2000;
      timeout = setTimeout(() => {
        const next = !d;
        setDotted(next);
        schedule(next);
      }, dur);
    }
    schedule(false);
    return () => clearTimeout(timeout);
  }, [phase]);

  const isDone = phase === 'done';
  const fontSize = size * 0.48;

  return (
    <div
      className="rounded-2xl ide-surface-inset border ide-border flex items-center justify-center relative overflow-hidden"
      style={{ width: size, height: size }}
    >
      {/* Back layer: stippled pixel char during scramble */}
      {!isDone && (
        <span
          className={`absolute ${scrambleFont} pixel-stipple text-white leading-none`}
          style={{
            fontSize,
            WebkitMaskSize: maskSize,
            maskSize,
          }}
        >
          {scrambleChar}
        </span>
      )}

      {/* Front layer: solid Lambda, revealed via clip-path */}
      {(phase === 'reveal' || isDone) && (
        <span
          className="absolute leading-none text-white font-semibold"
          style={{
            fontSize,
            ...(isDone ? {} : { clipPath: `inset(0 0 ${100 - revealProgress}% 0)` }),
          }}
        >
          <span
            style={{
              transition: 'opacity 0.6s ease-in-out',
              opacity: dotted ? 0 : 1,
            }}
          >
            {LAMBDA}
          </span>
          <span
            className={`absolute inset-0 flex items-center justify-center ${LANDED_FONT} pixel-stipple text-accent`}
            style={{
              fontSize,
              transition: 'opacity 0.6s ease-in-out',
              opacity: dotted ? 0.9 : 0,
            }}
          >
            {LAMBDA}
          </span>
        </span>
      )}
    </div>
  );
}
