'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Code,
  Users,
  Eye,
  RefreshCw,
  GitBranch,
  FileCode,
} from 'lucide-react';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { MiniAgentHub } from './MiniAgentHub';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const ITEMS = [
  {
    icon: Code,
    title: 'AI Code Generation',
    description:
      'Context-aware Liquid code written by AI agents in real-time.',
  },
  {
    icon: Users,
    title: 'Multi-Agent System',
    description:
      'Five specialized agents — a PM, three language experts, and a reviewer — working in parallel on your theme.',
  },
  {
    icon: Eye,
    title: 'Real-time Collaboration',
    description:
      'Live presence and cursors. See who\u2019s editing what, in real time.',
  },
  {
    icon: RefreshCw,
    title: 'Shopify Sync',
    description:
      'One-click sync, preview, and deploy to your store.',
  },
  {
    icon: GitBranch,
    title: 'Version Control',
    description:
      'Full history with undo/redo. Never lose a change.',
  },
  {
    icon: FileCode,
    title: 'Liquid Intelligence',
    description:
      'Real-time syntax validation and type checking.',
  },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ValuePropGrid() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="bg-[#fafaf9] dark:bg-[#111] group relative pt-20 md:pt-28 pb-0 overflow-hidden"
    >
      {/* ── Vertical frame lines + green ellipse (clipped to content width) */}
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
        {/* Top-right blurred green ellipse — clipped to content band */}
        <div
          className="absolute w-[700px] h-[600px] opacity-[0.25] dark:opacity-[0.12]"
          style={{
            top: '-200px',
            right: '-243px',
            background: 'radial-gradient(rgb(40, 205, 86) 0%, transparent 87%)',
            filter: 'blur(117px)',
          }}
        />
      </div>

      {/* ── Section header — two-column: copy + mini agent hub ────── */}
      <div className="relative z-[2] max-w-6xl mx-auto px-8 md:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-12 items-center">
          {/* Left: copy */}
          <div>
            <span className="section-badge">CAPABILITIES</span>
            <h2 className="text-left max-w-xl text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
              {['Five', 'agents.'].map((word, i) => (
                <span key={i} className="inline-block overflow-hidden">
                  <motion.span
                    className="inline-block"
                    initial={{ opacity: 0, y: '100%' }}
                    animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: '100%' }}
                    transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >{word}</motion.span>
                  {'\u00A0'}
                </span>
              ))}
              <span className="inline-block overflow-hidden">
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0, y: '100%' }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: '100%' }}
                  transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                ><PixelAccent>Zero</PixelAccent></motion.span>
                {'\u00A0'}
              </span>
              <span className="inline-block overflow-hidden">
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0, y: '100%' }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: '100%' }}
                  transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >bottlenecks.</motion.span>
              </span>
            </h2>
            <p className="text-left max-w-lg text-lg text-stone-500 dark:text-white/50 mt-6">
              From code generation to automated review to deployment — every step
              of theme development, orchestrated.
            </p>
          </div>

          {/* Right: mini animated agent hub diagram */}
          <div className="hidden lg:flex items-center justify-center">
            <MiniAgentHub inView={inView} />
          </div>
        </div>
      </div>

      {/* ── Swiss grid ─────────────────────────────────────────────── */}
      <div className="relative z-[2] max-w-6xl mx-auto mt-20 border-t border-stone-200 dark:border-white/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            const col = index % 3;
            const row = Math.floor(index / 3);
            const isLastCol = col === 2;
            const isLastRow = row === 1;

            // Rotate gradient positions per card for variety
            const offset = index * 17;
            const meshBg = [
              `radial-gradient(circle at ${(20 + offset) % 100}% ${(30 + offset * 0.7) % 100}%, rgba(40,205,86,0.6) 0%, transparent 50%)`,
              `radial-gradient(circle at ${(80 - offset * 0.5) % 100}% ${(20 + offset * 1.2) % 100}%, rgba(59,130,246,0.5) 0%, transparent 50%)`,
              `radial-gradient(circle at ${(60 + offset * 0.8) % 100}% ${(80 - offset * 0.6) % 100}%, rgba(168,85,247,0.4) 0%, transparent 50%)`,
              `radial-gradient(circle at ${(30 + offset * 0.4) % 100}% ${(70 - offset * 0.3) % 100}%, rgba(40,205,86,0.3) 0%, transparent 50%)`,
            ].join(', ');

            return (
              <motion.div
                key={item.title}
                className={`group/card relative overflow-hidden p-8 md:p-10 ${
                  !isLastCol ? 'border-r border-stone-200 dark:border-white/10' : ''
                } ${!isLastRow ? 'border-b border-stone-200 dark:border-white/10' : ''}`}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {/* Gradient mesh overlay */}
                <div
                  className="absolute -inset-10 z-0 opacity-0 group-hover/card:opacity-[0.25] dark:group-hover/card:opacity-[0.30] transition-opacity duration-500 pointer-events-none"
                  style={{ background: meshBg }}
                  aria-hidden="true"
                />
                <div className="relative z-[1]">
                  <Icon size={24} className="text-stone-400 dark:text-white/40" />
                  <h3 className="text-base font-medium text-stone-900 dark:text-white mt-3">
                    {item.title}
                  </h3>
                  <p className="text-sm text-stone-500 dark:text-white/50 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
