'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { BentoGrid } from '../bento/BentoGrid';
import { BentoCard } from '../bento/BentoCard';
import { BentoMetric } from '../bento/BentoMetric';

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

export function FeaturesSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <motion.section
      ref={ref}
      id="features"
      className="section-lift relative py-24 md:py-32 bg-stone-50"
      initial="initial"
      animate={inView ? 'animate' : 'initial'}
      variants={{
        initial: {},
        animate: {
          transition: { staggerChildren: 0.06, delayChildren: 0.1 },
        },
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          variants={{ initial: fadeInUp.initial, animate: fadeInUp.animate }}
          transition={fadeInUp.transition}
        >
          <span className="inline-block rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 mb-4">
            FEATURES
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 mb-6 max-w-3xl mx-auto leading-[1.1] tracking-[-0.03em]">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="text-stone-500 text-lg max-w-xl mx-auto">
            A complete AI-powered development environment built for Shopify theme developers.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={{ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
        <BentoGrid columns={4}>
          {/* AI Code Generation - 2x2 */}
          <BentoCard
            size="2x2"
            variant="code-texture"
            theme="light"
            label="AI ENGINE"
            title="AI Code Generation"
            description="Watch AI agents write production-ready Liquid code in real-time. Context-aware, type-safe, and optimized for conversion."
            href="#"
          >
            {/* Mini code editor visual */}
            <div className="mt-4 rounded-lg bg-stone-200/60 p-4 font-mono text-[11px] leading-5 overflow-hidden">
              <div className="text-stone-500 mb-2 text-[9px]">hero-section.liquid</div>
              <div><span className="text-cyan-600">{'{% assign '}</span><span className="text-accent">heading</span> = <span className="text-accent">section.settings.heading</span><span className="text-cyan-600">{' %}'}</span></div>
              <div className="text-stone-600">{'<section class="hero">'}</div>
              <div className="text-stone-600">{'  <h1>'}
                <span className="text-cyan-600">{'{{ heading }}'}</span>
                {'</h1>'}
              </div>
              <div className="text-stone-600">{'  <div class="hero__cta">'}</div>
              <div className="text-stone-400 animate-pulse">{'    █'}</div>
            </div>
          </BentoCard>

          {/* Multi-Agent System - 2x1 */}
          <BentoCard
            size="2x1"
            variant="glass"
            theme="light"
            label="ORCHESTRATION"
            title="Multi-Agent System"
            description="Three specialized AI agents working in parallel. Code, Design, and QA -- each understanding your theme's full context."
          >
            <div className="flex items-center gap-6 mt-4">
              {[
                { name: 'Code', color: 'bg-green-500' },
                { name: 'Design', color: 'bg-blue-400' },
                { name: 'QA', color: 'bg-purple-400' },
              ].map((agent) => (
                <div key={agent.name} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${agent.color} animate-pulse`} />
                  <span className="text-xs text-warm-gray">{agent.name}</span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Visual Validation - 1x1 */}
          <BentoCard
            size="1x1"
            variant="glass"
            theme="light"
            label="QUALITY"
            title="Visual Validation"
            description="AI-powered screenshot comparison catches visual regressions before they ship."
          >
            <div className="mt-3 flex gap-1">
              <div className="flex-1 h-16 rounded bg-stone-200 flex items-center justify-center text-[8px] text-stone-500">Before</div>
              <div className="flex-1 h-16 rounded bg-accent/10 flex items-center justify-center text-[8px] text-accent gap-1">After <Check size={14} strokeWidth={2} /></div>
            </div>
          </BentoCard>

          {/* Shopify Sync - 1x1 accent */}
          <BentoCard
            size="1x1"
            variant="accent"
            theme="light"
            label="INTEGRATION"
            title="Shopify Sync"
            description="One-click sync to your Shopify store. Push changes, preview live, deploy instantly."
          >
            <div className="mt-3 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center">
                <RefreshCw size={20} strokeWidth={1.5} />
              </div>
            </div>
          </BentoCard>

          {/* Version Control - 1x2 */}
          <BentoCard
            size="1x2"
            variant="code-texture"
            theme="light"
            label="HISTORY"
            title="Version Control"
            description="Full version history with undo/redo. Never lose a change."
          >
            <div className="mt-4 space-y-3">
              {[
                { time: '2m ago', msg: 'Updated hero section', color: 'bg-green-500' },
                { time: '5m ago', msg: 'Added product grid', color: 'bg-blue-400' },
                { time: '12m ago', msg: 'Initial template', color: 'bg-stone-400' },
              ].map((commit, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full ${commit.color}`} />
                    {i < 2 && <div className="w-px h-6 bg-white/10" />}
                  </div>
                  <div>
                    <p className="text-xs text-white/80">{commit.msg}</p>
                    <p className="text-[10px] text-stone-500">{commit.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Performance - 1x1 metric */}
          <BentoCard
            size="1x1"
            variant="glass"
            theme="light"
            label="SPEED"
          >
            <BentoMetric
              value={40}
              suffix="%"
              label="FASTER DEVELOPMENT"
              className="mt-4"
            />
          </BentoCard>

          {/* Liquid Intelligence - 1x1 */}
          <BentoCard
            size="1x1"
            variant="glass"
            theme="light"
            label="VALIDATION"
            title="Liquid Intelligence"
            description="Real-time syntax validation and type checking for Liquid templates."
          >
            <div className="mt-2 font-mono text-[10px] leading-4 flex flex-col gap-1">
              <div className="text-green-600 flex items-center gap-1.5"><Check size={12} strokeWidth={2} /> Valid schema</div>
              <div className="text-green-600 flex items-center gap-1.5"><Check size={12} strokeWidth={2} /> No undefined objects</div>
              <div className="text-accent flex items-center gap-1.5"><AlertTriangle size={12} strokeWidth={2} /> Unused variable</div>
            </div>
          </BentoCard>

          {/* Collaboration - 2x1 */}
          <BentoCard
            size="2x1"
            variant="glass"
            theme="light"
            label="TEAMWORK"
            title="Real-Time Collaboration"
            description="Multiple developers editing simultaneously with live cursors and conflict resolution."
          >
            <div className="mt-4 flex items-center gap-3">
              {['A', 'B', 'C'].map((initial, i) => (
                <div
                  key={initial}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{
                    backgroundColor: ['oklch(0.769 0.188 70)', 'oklch(0.623 0.214 259)', 'oklch(0.586 0.262 293)'][i],
                    color: 'oklch(0.156 0 0)',
                  }}
                >
                  {initial}
                </div>
              ))}
              <span className="text-xs text-stone-500 ml-2">3 editing now</span>
            </div>
          </BentoCard>
        </BentoGrid>
        </motion.div>
      </div>
    </motion.section>
  );
}

