'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export function CenteredHero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-24 bg-[oklch(0.145_0_0)] overflow-hidden">
      {/* Subtle radial gradient — no harsh edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, oklch(0.685 0.169 237 / 0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
        <motion.h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-white leading-[1.05] tracking-[-0.03em] mb-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Radically different theme development.
        </motion.h1>
        <motion.p
          className="text-lg md:text-xl text-white/70 mb-10 max-w-lg mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          Apply in minutes. Build Shopify themes with AI that understands Liquid—no more manual templating.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <input
            type="email"
            placeholder="Enter your email"
            className="w-full sm:flex-1 h-12 px-4 rounded-full bg-white/08 border border-white/12 text-white placeholder:text-white/40 focus:outline-none focus:border-accent/50 transition-colors"
            aria-label="Email"
          />
          <Link
            href="/signup"
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 gradient-accent text-white font-semibold rounded-full hover:shadow-[0_0_30px_oklch(0.685_0.169_237_/_0.4)] transition-shadow shrink-0"
          >
            Start Free
          </Link>
        </motion.div>

        <motion.p
          className="mt-4 text-xs text-white/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          No credit card required. Free for solo projects.
        </motion.p>
      </div>

      {/* Optional: subtle product visual placeholder — Mercury uses a phone mockup */}
      <motion.div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-sm opacity-60"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 0.6, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        aria-hidden
      >
        <div className="aspect-[4/3] rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center">
          <span className="font-mono text-white/30 text-sm">IDE preview</span>
        </div>
      </motion.div>
    </section>
  );
}
