'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { AuthModal } from './AuthModal';
import { SynapseLogo } from './SynapseLogo';
import { usePageReady } from '@/components/marketing/PreloaderContext';
import { useAuthModal } from '@/components/marketing/AuthModalContext';
import { createClient } from '@/lib/supabase/client';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
];

export function Navbar() {
  const ready = usePageReady();
  const router = useRouter();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('synapse-theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
      return true;
    }
    return false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { authModal, openAuthModal, closeAuthModal } = useAuthModal();

  useEffect(() => {
    const supabase = createClient();

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsAuthenticated(Boolean(session));
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleToggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('synapse-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('synapse-theme', 'light');
      }
      return next;
    });
  }, []);

  const hamburgerBar = 'w-5 h-[1.5px] bg-stone-900 dark:bg-white block';

  const handlePrimaryAuthAction = useCallback(async () => {
    if (isAuthenticated) {
      const supabase = createClient();
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      router.refresh();
      return;
    }

    openAuthModal('login');
  }, [isAuthenticated, openAuthModal, router]);

  const handleCtaAction = useCallback(() => {
    if (isAuthenticated) {
      router.push('/projects');
      return;
    }

    openAuthModal('signup');
  }, [isAuthenticated, openAuthModal, router]);

  return (
    <>
      <motion.header
        className="sticky top-0 z-50 w-full bg-[#fafaf9]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-md border-b border-stone-200 dark:border-white/10"
        initial={{ y: -64 }}
        animate={ready ? { y: 0 } : { y: -64 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <div className="relative w-full h-14 flex items-center">
          {/* Vertical dividers — left and right of content band */}
          <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
            <div className="relative h-full">
              <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
              <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
            </div>
          </div>
          {/* Content container — centered max-w-6xl */}
          <div className="relative max-w-6xl mx-auto px-6 w-full flex items-center justify-between">
            {/* Logo — left */}
            <Link href="/" className="text-stone-900 dark:text-white shrink-0">
              <SynapseLogo />
            </Link>

            {/* Desktop links — center */}
            <nav className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-[15px] text-stone-500 dark:text-white/50 hover:text-stone-900 dark:hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right side — Log in, CTA, theme toggle, hamburger */}
            <div className="flex items-center gap-3 md:gap-4">
              <button
                type="button"
                onClick={() => void handlePrimaryAuthAction()}
                className="hidden md:inline-flex text-sm text-stone-500 dark:text-white/50 hover:text-stone-900 dark:hover:text-white transition-colors"
              >
                {isAuthenticated ? 'Log out' : 'Log in'}
              </button>

              <button
                type="button"
                onClick={handleCtaAction}
                className="hidden md:inline-flex px-5 py-2 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                {isAuthenticated ? 'See Projects' : 'Start Free'}
              </button>

              <ThemeToggle
                isDark={isDark}
                onToggle={handleToggle}
                variant={isDark ? 'dark' : 'light'}
              />

              {/* Hamburger (mobile) */}
              <button
                type="button"
                className="md:hidden flex flex-col gap-1.5 p-2"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-label="Toggle menu"
              >
                <motion.span
                  className={hamburgerBar}
                  animate={mobileOpen ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }}
                />
                <motion.span
                  className={hamburgerBar}
                  animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
                />
                <motion.span
                  className={hamburgerBar}
                  animate={mobileOpen ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }}
                />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {NAV_LINKS.map((link, i) => (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
              >
                <Link
                  href={link.href}
                  className="text-2xl text-white font-medium"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              <button
                type="button"
                className="text-lg text-white/70 hover:text-white transition-colors"
                onClick={() => {
                  setMobileOpen(false);
                  void handlePrimaryAuthAction();
                }}
              >
                {isAuthenticated ? 'Log out' : 'Log in'}
              </button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.5, duration: 0.3 }}
            >
              <button
                type="button"
                className="inline-flex items-center justify-center px-8 py-3 rounded-full bg-accent text-white font-semibold text-lg hover:bg-accent-hover transition-colors"
                onClick={() => {
                  setMobileOpen(false);
                  handleCtaAction();
                }}
              >
                {isAuthenticated ? 'See Projects' : 'Start Free'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthModal
        isOpen={authModal !== null}
        onClose={closeAuthModal}
        initialView={authModal ?? 'login'}
      />
    </>
  );
}
