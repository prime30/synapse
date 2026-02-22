'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const STEPS = [
  {
    number: 1,
    title: 'Create an account',
    description:
      'Sign up at synapse.shop with your email or GitHub account. Choose the plan that fits your workflow — start with Free to explore, then upgrade to Pro when you\'re ready to connect a Shopify store.',
    content: {
      type: 'callout' as const,
      text: 'Tip: The Free plan gives you full access to the IDE and local development features. Pro unlocks unlimited AI agents, Shopify sync, and team collaboration.',
    },
  },
  {
    number: 2,
    title: 'Install the MCP server',
    description:
      'Install the Synapse MCP server globally so your IDE can communicate with Synapse agents. Then add the configuration to your IDE settings.',
    content: {
      type: 'code' as const,
      lines: [
        '# Install the MCP server globally',
        'npm install -g @synapse/mcp-server',
        '',
        '# Verify the installation',
        'synapse-mcp --version',
        '',
        '# Add to your IDE MCP config (e.g. .cursor/mcp.json)',
        '{',
        '  "mcpServers": {',
        '    "synapse": {',
        '      "command": "synapse-mcp",',
        '      "args": ["--project", "your-project-id"]',
        '    }',
        '  }',
        '}',
      ],
    },
  },
  {
    number: 3,
    title: 'Connect your Shopify store',
    description:
      'Link your Shopify store to Synapse via secure OAuth. You\'ll be redirected to Shopify to authorize access, then back to Synapse with your store connected.',
    content: {
      type: 'code' as const,
      lines: [
        '# Connect via CLI',
        'synapse store connect \\',
        '  --store my-store.myshopify.com',
        '',
        '# This opens a browser for OAuth authorization.',
        '# Once approved, your store is linked automatically.',
        '',
        '# Verify the connection',
        'synapse store status',
      ],
    },
  },
  {
    number: 4,
    title: 'Create your first project',
    description:
      'Create a new project and import an existing theme, or start from a blank canvas. Synapse will sync your theme files automatically and keep them in sync.',
    content: {
      type: 'code' as const,
      lines: [
        '# Create a new project',
        'synapse project create \\',
        '  --name "My Store Redesign" \\',
        '  --store my-store.myshopify.com',
        '',
        '# Import an existing theme',
        'synapse theme import --theme-id 12345',
        '',
        '# Or start from a template',
        'synapse project create --template dawn',
      ],
    },
  },
  {
    number: 5,
    title: 'Run your first agent',
    description:
      'Describe what you want in natural language. The PM agent analyzes your request, breaks it into tasks, and delegates to specialist agents — Liquid, CSS, JavaScript, and review.',
    content: {
      type: 'code' as const,
      lines: [
        '# In your IDE, use the Synapse MCP tool',
        'execute_agent({',
        '  project_id: "proj_abc123",',
        '  agent_type: "pm",',
        '  prompt: "Build a responsive hero section',
        '    with an animated headline and CTA button"',
        '})',
        '',
        '# Expected output:',
        '# ✓ PM agent created 3 tasks',
        '# ✓ Liquid agent: hero section template',
        '# ✓ CSS agent: responsive styles + animation',
        '# ✓ Review agent: validated all changes',
      ],
    },
  },
];

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-white/10 bg-stone-900 dark:bg-black/60 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
        <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-stone-300 font-mono">
          {lines.map((line, i) => (
            <span key={i} className="block">
              {line.startsWith('#') ? (
                <span className="text-stone-500">{line}</span>
              ) : line.startsWith('//') ? (
                <span className="text-stone-500">{line}</span>
              ) : (
                line
              )}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Callout({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 p-4 flex items-start gap-3">
      <Sparkles className="text-accent h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden />
      <p className="text-sm text-stone-700 dark:text-white/70 leading-relaxed">
        {text}
      </p>
    </div>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function GettingStartedPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            GETTING STARTED
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Up and running in 5&nbsp;minutes.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-xl mx-auto">
            From sign-up to your first AI-generated theme change in five
            straightforward steps.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="max-w-3xl mx-auto px-6 space-y-16">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.05 * i }}
            >
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="absolute left-5 top-14 bottom-[-4rem] w-px bg-gradient-to-b from-stone-200 dark:from-white/10 to-transparent" />
              )}

              <div className="flex items-start gap-6">
                {/* Number badge */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-stone-900 dark:bg-white/10 flex items-center justify-center">
                  <span className="text-sm font-semibold text-white dark:text-white/80 font-mono">
                    {step.number}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-medium text-stone-900 dark:text-white mb-3">
                    {step.title}
                  </h2>
                  <p className="text-stone-500 dark:text-white/50 leading-relaxed mb-5">
                    {step.description}
                  </p>

                  {step.content.type === 'code' && (
                    <CodeBlock lines={step.content.lines!} />
                  )}
                  {step.content.type === 'callout' && (
                    <Callout text={step.content.text!} />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div className="max-w-3xl mx-auto px-6 mt-24" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-12 text-center">
            <h3 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white mb-3">
              Ready to build?
            </h3>
            <p className="text-stone-500 dark:text-white/50 text-lg mb-8 max-w-md mx-auto">
              Create your account and start shipping Shopify themes with
              multi-agent AI today.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 px-8 py-3.5 text-sm font-semibold tracking-wide hover:bg-stone-800 dark:hover:bg-white/90 transition-colors"
            >
              Get started free
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
