'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { GlassCard } from '../glass/GlassCard';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { useAuthModal } from '@/components/marketing/AuthModalContext';

const TESTIMONIALS = [
  {
    quote: "Synapse transformed how our agency builds Shopify themes. What used to take weeks now takes days \u2014 the agents understand Liquid better than most developers.",
    author: "Alex Chen",
    role: "Lead Developer",
    company: "Shopify Plus Agency",
  },
  {
    quote: "The schema-aware completions and live preview alone saved us hours per project. Our team ships themes twice as fast without sacrificing code quality.",
    author: "Sarah Kim",
    role: "CTO",
    company: "E-commerce Studio",
  },
  {
    quote: "Finally, an IDE that understands Shopify end-to-end. From Liquid objects to section schemas to deployment \u2014 it handles the full workflow.",
    author: "Marcus Johnson",
    role: "Senior Developer",
    company: "Independent Theme Developer",
  },
];

export function SocialProofSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const { openAuthModal } = useAuthModal();

  return (
    <motion.section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] z-10"
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            TESTIMONIALS
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white mb-6 max-w-3xl mx-auto leading-[1.1] tracking-[-0.03em]">
            Built for the developers who build the storefronts.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <GlassCard key={testimonial.author} padding="lg" theme="light">
              <blockquote className="relative">
                <span className="absolute -top-2 -left-1 text-[120px] text-stone-200 dark:text-white/10 font-serif leading-none select-none" aria-hidden="true">&ldquo;</span>
                <p className="relative text-stone-800 dark:text-white/70 text-sm leading-relaxed mb-6 pl-8">
                  {testimonial.quote}&rdquo;
                </p>
                <footer className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-medium text-sm">
                    {testimonial.author[0]}
                  </div>
                  <div>
                    <p className="text-stone-900 dark:text-white text-sm font-medium">{testimonial.author}</p>
                    <p className="text-stone-500 dark:text-white/50 text-xs">{testimonial.role} · {testimonial.company}</p>
                  </div>
                </footer>
              </blockquote>
            </GlassCard>
          ))}
        </div>

        <div className="text-center mt-16">
          <MagneticElement strength={6} radius={120}>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className="inline-flex items-center justify-center px-10 py-3.5 gradient-accent text-white font-semibold rounded-full text-lg hover:shadow-[0_0_30px_oklch(0.745_0.189_148_/_0.35)] transition-shadow focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50"
            >
              Start Free
            </button>
          </MagneticElement>
          <p className="text-stone-500 dark:text-white/50 text-sm mt-4">No credit card required</p>
        </div>
      </div>
    </motion.section>
  );
}

