'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { GlassCard } from '../glass/GlassCard';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';

const TESTIMONIALS = [
  {
    quote: "Synapse transformed how our agency builds Shopify themes. What used to take weeks now takes days.",
    author: "Alex Chen",
    role: "Lead Developer",
    company: "Shopify Plus Agency",
  },
  {
    quote: "The AI agents understand Liquid better than most developers. The code quality is remarkable.",
    author: "Sarah Kim",
    role: "CTO",
    company: "E-commerce Studio",
  },
  {
    quote: "Finally, an IDE that actually understands Shopify. The context awareness is game-changing.",
    author: "Marcus Johnson",
    role: "Senior Developer",
    company: "Theme Developer",
  },
];

export function SocialProofSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <motion.section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden bg-stone-50 z-10"
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 mb-4">
            SOCIAL PROOF
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 mb-6 max-w-3xl mx-auto leading-[1.1] tracking-[-0.03em]">
            Built for the developers who build the storefronts.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <GlassCard key={testimonial.author} padding="lg" theme="light">
              <blockquote className="relative">
                <span className="absolute -top-2 -left-1 text-[120px] text-stone-200 font-serif leading-none select-none" aria-hidden="true">&ldquo;</span>
                <p className="relative text-stone-800 text-sm leading-relaxed mb-6 pl-8">
                  {testimonial.quote}&rdquo;
                </p>
                <footer className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-medium text-sm">
                    {testimonial.author[0]}
                  </div>
                  <div>
                    <p className="text-stone-900 text-sm font-medium">{testimonial.author}</p>
                    <p className="text-stone-500 text-xs">{testimonial.role} · {testimonial.company}</p>
                  </div>
                </footer>
              </blockquote>
            </GlassCard>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <MagneticElement strength={6} radius={120}>
            <a
              href="/signup"
              className="inline-flex items-center justify-center px-10 py-3.5 gradient-accent text-white font-semibold rounded-full text-lg hover:shadow-[0_0_30px_rgba(40,205,86,0.35)] transition-shadow focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50"
            >
              Start Free
            </a>
          </MagneticElement>
          <p className="text-stone-500 text-sm mt-4">No credit card required</p>
        </div>
      </div>
    </motion.section>
  );
}

