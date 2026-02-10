'use client';

import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  variant?: 'light' | 'dark';
}

const BTN = 24;  // w-6 = 24px
const PAD = 2;   // p-0.5 = 2px

export function ThemeToggle({ isDark, onToggle, variant = 'dark' }: ThemeToggleProps) {
  const pillX = isDark ? 0 : BTN;
  const barWidth = BTN * 0.35;
  const barX = pillX + (BTN - barWidth) / 2;

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-full overflow-hidden isolate backdrop-blur-xl h-8 p-0.5',
        variant === 'dark'
          ? 'bg-zinc-800/90 border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]'
          : 'bg-zinc-100/90 border border-zinc-200/80 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]'
      )}
    >
      {/* Sliding glass indicator */}
      <motion.div
        className={cn(
          'absolute rounded-full overflow-hidden',
          variant === 'dark'
            ? 'bg-gradient-to-b from-white/15 to-white/10 border border-white/20 shadow-[0_1px_4px_rgba(0,0,0,0.08),0_4px_20px_rgba(255,255,255,0.12)]'
            : 'bg-gradient-to-b from-white/95 to-white/70 border border-white/60 shadow-[0_4px_20px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.5)]'
        )}
        initial={false}
        animate={{ x: pillX }}
        transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6 }}
        style={{ left: PAD, top: PAD, bottom: PAD, width: BTN }}
      />

      {/* Accent glow bar */}
      <motion.div
        className="absolute h-[2px] rounded-full bg-accent shadow-[0_0_8px_rgba(40,205,86,0.6)] bottom-[1px]"
        initial={false}
        animate={{ x: barX }}
        transition={{ type: 'spring', stiffness: 350, damping: 32, mass: 1.0, delay: 0.04 }}
        style={{ left: PAD, width: barWidth }}
      />

      {/* Ambient glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none z-0"
        initial={false}
        animate={{ x: pillX }}
        transition={{ type: 'spring', stiffness: 350, damping: 32, mass: 1.0, delay: 0.04 }}
        style={{
          left: PAD,
          top: PAD,
          bottom: PAD,
          width: BTN,
          background: 'radial-gradient(ellipse at 50% 80%, rgba(40,205,86,0.15) 0%, transparent 60%)',
        }}
      />

      {/* Moon button */}
      <button
        type="button"
        onClick={onToggle}
        className="relative z-10 flex items-center justify-center w-6 h-full rounded-full"
        aria-label="Dark mode"
      >
        <motion.span
          initial={false}
          animate={{ opacity: isDark ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'flex items-center justify-center',
            variant === 'dark' ? 'text-white' : 'text-stone-900'
          )}
        >
          <Moon size={13} />
        </motion.span>
      </button>

      {/* Sun button */}
      <button
        type="button"
        onClick={onToggle}
        className="relative z-10 flex items-center justify-center w-6 h-full rounded-full"
        aria-label="Light mode"
      >
        <motion.span
          initial={false}
          animate={{ opacity: isDark ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'flex items-center justify-center',
            variant === 'dark' ? 'text-white' : 'text-stone-900'
          )}
        >
          <Sun size={13} />
        </motion.span>
      </button>

      {/* Caustic overlay (dark variant only) */}
      {variant === 'dark' && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at ${isDark ? 30 : 70}% 20%, rgba(255,255,255,0.06) 0%, transparent 50%)`,
          }}
          animate={{ opacity: [0.5, 0.7, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}
