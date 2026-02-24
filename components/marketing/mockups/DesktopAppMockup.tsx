'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

const MOCK_TABS = ['index.liquid', 'hero-banner.liquid', 'theme.css'];
const MOCK_FILES = [
  { name: 'assets/', indent: 0, type: 'folder' },
  { name: 'config/', indent: 0, type: 'folder' },
  { name: 'layout/', indent: 0, type: 'folder' },
  { name: 'theme.liquid', indent: 1, type: 'file' },
  { name: 'sections/', indent: 0, type: 'folder' },
  { name: 'hero-banner.liquid', indent: 1, type: 'file', active: true },
  { name: 'product-card.liquid', indent: 1, type: 'file' },
  { name: 'footer.liquid', indent: 1, type: 'file' },
  { name: 'snippets/', indent: 0, type: 'folder' },
  { name: 'templates/', indent: 0, type: 'folder' },
];

const MOCK_CODE = [
  { num: 1, text: '{% schema %}', color: 'text-purple-400' },
  { num: 2, text: '  { "name": "Hero Banner",', color: 'text-amber-300' },
  { num: 3, text: '    "tag": "section",', color: 'text-amber-300' },
  { num: 4, text: '    "class": "hero-section",', color: 'text-amber-300' },
  { num: 5, text: '    "settings": [', color: 'text-amber-300' },
  { num: 6, text: '      { "type": "text",', color: 'text-sky-300' },
  { num: 7, text: '        "id": "heading",', color: 'text-sky-300' },
  { num: 8, text: '        "label": "Heading",', color: 'text-emerald-300' },
  { num: 9, text: '        "default": "Welcome" }', color: 'text-emerald-300' },
  { num: 10, text: '    ]', color: 'text-amber-300' },
  { num: 11, text: '  }', color: 'text-amber-300' },
  { num: 12, text: '{% endschema %}', color: 'text-purple-400' },
  { num: 13, text: '', color: '' },
  { num: 14, text: '<section class="hero">', color: 'text-rose-300' },
  { num: 15, text: '  <div class="hero__container">', color: 'text-rose-300' },
];

const MOCK_CHAT = [
  { role: 'user', text: 'Add a video background option to the hero banner' },
  {
    role: 'agent',
    text: 'I\'ll add a video_url setting to the schema and update the template with a <video> element that falls back to the image.',
  },
];

/**
 * A CSS-only desktop app window mockup showing the Synapse editor.
 * No images needed — pure Tailwind + Framer Motion.
 */
export function DesktopAppMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      className="relative w-full max-w-[920px] mx-auto"
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: EASE }}
    >
      {/* Glow behind the window */}
      <div
        className="absolute -inset-8 rounded-3xl opacity-40 dark:opacity-25 blur-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, oklch(0.745 0.189 148 / 0.15), oklch(0.685 0.169 237 / 0.08) 60%, transparent 80%)',
        }}
        aria-hidden
      />

      {/* Window frame */}
      <div className="relative rounded-xl overflow-hidden border border-stone-200/80 dark:border-white/10 shadow-2xl bg-[oklch(0.227_0_0)]">
        {/* Title bar */}
        <div className="flex items-center h-9 px-3 bg-[oklch(0.28_0_0)] border-b border-white/5 select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[oklch(0.63_0.22_20)]" />
            <span className="w-3 h-3 rounded-full bg-[oklch(0.84_0.16_80)]" />
            <span className="w-3 h-3 rounded-full bg-[oklch(0.72_0.19_145)]" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-[11px] text-white/30 tracking-wide">
              Synapse — hero-banner.liquid
            </span>
          </div>
          <div className="w-12" />
        </div>

        {/* Main layout: sidebar + editor + chat */}
        <div className="flex h-[420px] sm:h-[480px]">
          {/* File sidebar */}
          <div className="hidden sm:flex flex-col w-48 border-r border-white/5 bg-[oklch(0.244_0_0)] overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/25">
              Explorer
            </div>
            <div className="flex-1 overflow-y-auto px-1">
              {MOCK_FILES.map((f, i) => (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.04, ease: EASE }}
                  className={`flex items-center gap-1.5 px-2 py-[3px] rounded text-[11px] cursor-default ${
                    f.active
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                  style={{ paddingLeft: `${8 + f.indent * 12}px` }}
                >
                  <span className={f.type === 'folder' ? 'text-amber-400/60' : 'text-sky-400/50'}>
                    {f.type === 'folder' ? '▸' : '○'}
                  </span>
                  {f.name}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Code editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tabs */}
            <div className="flex items-center h-8 bg-[oklch(0.244_0_0)] border-b border-white/5">
              {MOCK_TABS.map((tab, i) => (
                <div
                  key={tab}
                  className={`px-3 h-full flex items-center text-[11px] border-r border-white/5 ${
                    i === 1
                      ? 'bg-[oklch(0.227_0_0)] text-white/80'
                      : 'text-white/30'
                  }`}
                >
                  {tab}
                </div>
              ))}
            </div>

            {/* Code lines */}
            <div className="flex-1 overflow-hidden font-mono text-[11px] leading-[18px] p-3">
              {MOCK_CODE.map((line, i) => (
                <motion.div
                  key={line.num}
                  className="flex"
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.3, delay: 0.5 + i * 0.04 }}
                >
                  <span className="w-8 shrink-0 text-right pr-3 text-white/15 select-none">
                    {line.num}
                  </span>
                  <span className={line.color}>{line.text}</span>
                </motion.div>
              ))}

              {/* Cursor blink */}
              <div className="flex mt-px">
                <span className="w-8 shrink-0 text-right pr-3 text-white/15 select-none">
                  16
                </span>
                <motion.span
                  className="w-[2px] h-[14px] bg-accent"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </div>
          </div>

          {/* AI Chat sidebar */}
          <div className="hidden md:flex flex-col w-56 border-l border-white/5 bg-[oklch(0.244_0_0)]">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/25 border-b border-white/5">
              AI Agent
            </div>
            <div className="flex-1 p-2.5 space-y-2.5 overflow-hidden">
              {MOCK_CHAT.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.8 + i * 0.2, ease: EASE }}
                  className={`rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-accent/10 text-accent/80 ml-3'
                      : 'bg-white/5 text-white/50 mr-3'
                  }`}
                >
                  {msg.text}
                </motion.div>
              ))}

              {/* Typing indicator */}
              <motion.div
                className="flex items-center gap-1 px-2.5 py-2"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ delay: 1.3 }}
              >
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-accent/40"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, delay: d * 0.2, repeat: Infinity }}
                  />
                ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center h-6 px-3 bg-accent text-white text-[10px] gap-4 select-none">
          <span>● Connected</span>
          <span className="opacity-60">main</span>
          <span className="opacity-60">Ln 15, Col 32</span>
          <span className="ml-auto opacity-60">Synapse v0.1.0</span>
        </div>
      </div>
    </motion.div>
  );
}
