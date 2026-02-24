'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useInView } from 'framer-motion';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { PromptExperienceMockup } from '@/components/marketing/mockups/PromptExperienceMockup';
import { useAuthModal } from '@/components/marketing/AuthModalContext';
import { createClient } from '@/lib/supabase/client';

/* ------------------------------------------------------------------ */
/*  FinalCTAV2                                                         */
/* ------------------------------------------------------------------ */

export default function FinalCTAV2() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const router = useRouter();
  const { openAuthModal } = useAuthModal();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /* ── Auth state ─────────────────────────────────────────────────── */

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setIsAuthenticated(!!session);
    };
    syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setIsAuthenticated(!!session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleCtaAction = useCallback(() => {
    if (isAuthenticated) {
      router.push('/projects');
      return;
    }
    openAuthModal('signup');
  }, [isAuthenticated, openAuthModal, router]);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <section
      ref={ref}
      className="relative bg-gradient-to-br from-[oklch(0.985_0.001_106)] via-[oklch(0.965_0.02_145)] to-[oklch(0.985_0.001_106)] dark:from-[oklch(0.145_0_0)] dark:via-[oklch(0.18_0.02_150)] dark:to-[oklch(0.145_0_0)] overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-8 md:px-10 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column — text + CTA */}
          <div>
            <motion.h2
              className="text-4xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-tight"
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              Stop context-switching.
              <br />
              <PixelAccent>Ship themes faster.</PixelAccent>
            </motion.h2>

            <motion.p
              className="text-lg text-stone-500 dark:text-white/50 mt-6 leading-relaxed max-w-sm sm:max-w-md"
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{
                duration: 0.6,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              The AI-powered Shopify theme IDE with Liquid intelligence,
              performance scoring, and one-click deploy. Free for solo
              developers.
            </motion.p>

            <motion.div
              className="mt-10"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{
                duration: 0.6,
                delay: 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <MagneticElement strength={6} radius={120}>
                <button
                  type="button"
                  onClick={handleCtaAction}
                  className="h-12 px-6 sm:px-8 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
                >
                  {isAuthenticated
                    ? 'Open Editor'
                    : 'Start Free'}
                </button>
              </MagneticElement>
            </motion.div>

            <motion.p
              className="text-sm text-stone-400 dark:text-white/30 mt-5"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : { opacity: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              Runs in the browser. Works with your existing Shopify themes.
            </motion.p>
          </div>

          {/* Right column — mockup (desktop only) */}
          <motion.div
            className="hidden lg:block"
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{
              duration: 0.8,
              delay: 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <PromptExperienceMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
