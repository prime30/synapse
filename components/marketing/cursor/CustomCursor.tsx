'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { motion, useSpring } from 'framer-motion';

const CURSOR_SIZE = 10;

export function CustomCursor() {
  const [isPointer, setIsPointer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Critically-damped spring: follows mouse tightly with zero overshoot
  const springCfg = { stiffness: 800, damping: 60, mass: 0.5 };
  const x = useSpring(0, springCfg);
  const y = useSpring(0, springCfg);

  useEffect(() => {
    startTransition(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const isTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (isTouch) return;

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };

    const enter = () => {
      document.body.classList.add('cursor-none');
    };
    const leave = () => {
      document.body.classList.remove('cursor-none');
    };

    const checkTarget = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const interactive =
        target.closest('a') ||
        target.closest('button') ||
        target.closest('[data-cursor="bracket"]');
      setIsPointer(!!interactive);
    };

    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mousemove', checkTarget, { passive: true });
    document.body.addEventListener('mouseenter', enter);
    document.body.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousemove', checkTarget);
      document.body.removeEventListener('mouseenter', enter);
      document.body.removeEventListener('mouseleave', leave);
      document.body.classList.remove('cursor-none');
    };
  }, [mounted, x, y]);

  if (!mounted) return null;

  return (
    <motion.div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
      style={{
        x,
        y,
        translateX: '-50%',
        translateY: '-50%',
      }}
    >
      {isPointer ? (
        <motion.span
          className="font-mono text-white text-lg font-semibold block"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {'{ }'}
        </motion.span>
      ) : (
        <motion.div
          className="rounded-full bg-white"
          style={{ width: CURSOR_SIZE, height: CURSOR_SIZE }}
          initial={false}
          animate={{ scale: 1 }}
        />
      )}
    </motion.div>
  );
}
