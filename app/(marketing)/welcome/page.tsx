'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { GlassCard } from '@/components/marketing/glass';

const STEPS = [
  {
    number: '01',
    title: 'Connect Shopify',
    description: 'Link your Shopify store to sync themes and assets automatically.',
    icon: '🔗',
  },
  {
    number: '02',
    title: 'Choose a Theme',
    description: 'Start from scratch or import an existing theme to enhance with AI.',
    icon: '🎨',
  },
  {
    number: '03',
    title: 'Start Building',
    description: 'Let the AI agents help you write, validate, and deploy your theme.',
    icon: '🚀',
  },
];

export default function WelcomePage() {
  return (
    <div className="relative min-h-screen film-grain bg-[#0a0a0a]">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-radial from-sky-500/5 via-transparent to-transparent" />
      </div>

      <main className="relative flex flex-col items-center justify-center min-h-screen px-6 py-16">
        {/* Welcome message */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <motion.div
            className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-accent/20 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
          >
            <span className="font-pixel text-3xl text-accent">S</span>
          </motion.div>

          <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-white/50 mb-4">
            WELCOME TO SYNAPSE
          </span>
          <h1 className="text-5xl md:text-6xl font-medium text-white mb-4 leading-[1.1] tracking-[-0.03em]">
            You&apos;re in.
          </h1>
          <p className="text-white/70 text-lg max-w-md mx-auto">
            Your AI-powered development environment is ready. Here&apos;s how to get started.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mb-16">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.4 + i * 0.15,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
            >
              <GlassCard padding="lg" hoverScale className="h-full text-center">
                <div className="text-3xl mb-4">{step.icon}</div>
                <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-white/50 mb-2">
                  STEP {step.number}
                </span>
                <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{step.description}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
        >
          <Link
            href="/projects"
            className="inline-flex items-center justify-center px-10 py-4 gradient-accent text-white font-semibold rounded-full text-lg hover:shadow-[0_0_30px_rgba(14,165,233,0.4)] transition-shadow"
          >
            Open Synapse
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
