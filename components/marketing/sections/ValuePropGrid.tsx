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

export function ValuePropGrid() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="bg-[#fafaf9] dark:bg-[#111] group relative py-20 md:py-28 overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-700 pointer-events-none font-mono text-[9px] leading-[13px] text-stone-900 dark:text-white whitespace-pre overflow-hidden select-none"
        aria-hidden="true"
      >
        {`{% schema %}\n  { "name": "capabilities", "tag": "section" }\n{% endschema %}\n{% for block in section.blocks %}\n  {{ block.settings.title }}\n{% endfor %}\n`.repeat(8)}
      </div>
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-8 md:px-10">
        {/* Section header */}
        <div>
          <span className="section-badge">CAPABILITIES</span>
          <h2 className="text-left max-w-xl text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            {['Five', 'agents.'].map((word, i) => (
              <span key={i} className="inline-block overflow-hidden">
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0, y: '100%' }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >{word}</motion.span>
                {'\u00A0'}
              </span>
            ))}
            <span className="inline-block overflow-hidden">
              <motion.span
                className="inline-block"
                initial={{ opacity: 0, y: '100%' }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              ><PixelAccent>Zero</PixelAccent></motion.span>
              {'\u00A0'}
            </span>
            <span className="inline-block overflow-hidden">
              <motion.span
                className="inline-block"
                initial={{ opacity: 0, y: '100%' }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >bottlenecks.</motion.span>
            </span>
          </h2>
          <p className="text-left max-w-lg text-lg text-stone-500 dark:text-white/50 mt-6">
            From code generation to automated review to deployment — every step
            of theme development, orchestrated.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                className="relative"
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Icon size={24} className="text-stone-400 dark:text-white/40" />
                <h3 className="text-base font-medium text-stone-900 dark:text-white mt-3">
                  {item.title}
                </h3>
                <p className="text-sm text-stone-500 dark:text-white/50 mt-1 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
