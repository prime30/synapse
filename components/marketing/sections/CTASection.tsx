'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useInView } from 'framer-motion';
import { PromptExperienceMockup } from '../mockups/PromptExperienceMockup';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { useAuthModal } from '@/components/marketing/AuthModalContext';
import { createClient } from '@/lib/supabase/client';

export function CTASection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const router = useRouter();
  const { openAuthModal } = useAuthModal();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const syncSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setIsAuthenticated(!!session);
    };
    syncSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="relative bg-gradient-to-br from-[oklch(0.985_0.001_106)] via-[oklch(0.965_0.02_145)] to-[oklch(0.985_0.001_106)] dark:from-[oklch(0.145_0_0)] dark:via-[oklch(0.18_0.02_150)] dark:to-[oklch(0.145_0_0)] overflow-hidden"
    >
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column — text + CTA (staggered children) */}
          <div>
            <motion.h2
              className="text-3xl sm:text-4xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-tight"
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              Start <PixelAccent>building</PixelAccent>.
            </motion.h2>
            <motion.p
              className="text-lg text-stone-500 dark:text-white/50 mt-6 leading-relaxed max-w-full sm:max-w-md"
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              No credit card required. Free for personal projects.
            </motion.p>

            <motion.div
              className="mt-10"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <MagneticElement strength={6} radius={120}>
                <button
                  type="button"
                  onClick={handleCtaAction}
                  className="h-12 px-8 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
                >
                  {isAuthenticated ? 'Open Editor' : 'Start Free'}
                </button>
              </MagneticElement>
            </motion.div>
          </div>

          {/* Right column — prompting experience mockup */}
          <motion.div
            className="hidden lg:block"
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <PromptExperienceMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
