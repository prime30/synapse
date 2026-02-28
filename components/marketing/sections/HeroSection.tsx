'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { CodeEditorMockup } from '@/components/marketing/mockups/CodeEditorMockup';
import { usePageReady } from '@/components/marketing/PreloaderContext';
import { useAuthModal } from '@/components/marketing/AuthModalContext';

const ROTATING_WORDS = ['themes', 'stores', 'clients', 'sections', 'features', 'fixes'];

/* ------------------------------------------------------------------ */
/*  Code easter-egg data                                               */
/* ------------------------------------------------------------------ */

const EGG_LINES = [
  '{% schema %}  { "name": "Hero Banner", "tag": "section", "class": "hero-section", "limit": 1, "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Welcome" },',
  '  { "type": "richtext", "id": "body", "label": "Body text" }, { "type": "url", "id": "cta_link", "label": "CTA link" }, { "type": "image_picker", "id": "background_image", "label": "Background" },',
  '  { "type": "select", "id": "layout", "label": "Layout", "options": [{ "value": "full", "label": "Full width" }, { "value": "contained", "label": "Contained" }], "default": "full" },',
  '  { "type": "range", "id": "padding_top", "min": 0, "max": 120, "step": 4, "unit": "px", "label": "Top padding", "default": 60 } ], "presets": [{ "name": "Hero", "category": "Banner" }] }',
  '{% endschema %}                                                                                                                                                                              ',
  '',
  '{% assign heading = section.settings.heading %}  {% assign body = section.settings.body %}  {% assign cta = section.settings.cta_link %}  {% assign bg = section.settings.background_image %}',
  '{% assign layout = section.settings.layout %}  {% assign pad_top = section.settings.padding_top %}  {% assign pad_bottom = section.settings.padding_bottom | default: 60 %}',
  '',
  '{% if heading != blank %}                                                                                                                                                                    ',
  '  <section class="hero hero--{{ layout }}" style="padding-top: {{ pad_top }}px; padding-bottom: {{ pad_bottom }}px;" data-section-id="{{ section.id }}" data-section-type="hero-banner">',
  '    {% if bg %}<div class="hero__background"><img src="{{ bg | image_url: width: 1920 }}" alt="{{ bg.alt | escape }}" loading="eager" width="1920" height="1080" fetchpriority="high"></div>{% endif %}',
  '    <div class="hero__container page-width">                                                                                                                                                 ',
  '      <h1 class="hero__heading h0">{{ heading | escape }}</h1>                                                                                                                               ',
  '      {% if body != blank %}<div class="hero__body rte">{{ body }}</div>{% endif %}                                                                                                          ',
  '      {% if cta != blank %}<a href="{{ cta }}" class="hero__cta btn btn--primary btn--large">{{ section.settings.cta_text | default: "Shop now" }}</a>{% endif %}',
  '    </div>                                                                                                                                                                                   ',
  '  </section>                                                                                                                                                                                 ',
  '{% endif %}                                                                                                                                                                                  ',
  '',
  '{% for product in collection.products limit: 12 %}  {% assign first_variant = product.variants.first %}  {% assign on_sale = false %}  {% if first_variant.compare_at_price > first_variant.price %}{% assign on_sale = true %}{% endif %}',
  '  {% render "product-card", product: product, show_vendor: section.settings.show_vendor, show_rating: true, on_sale: on_sale, lazy_load: forloop.index > 4 %}',
  '{% endfor %}                                                                                                                                                                                 ',
  '',
  '{{ "theme.css" | asset_url | stylesheet_tag }}  {{ "vendor.js" | asset_url | script_tag: async: true }}  {{ "application.js" | asset_url | script_tag: defer: true }}',
  '{{ "component-hero.css" | asset_url | stylesheet_tag }}  {{ "component-product-card.css" | asset_url | stylesheet_tag }}  {{ "component-price.css" | asset_url | stylesheet_tag }}',
  '',
  '{% liquid                                                                                                                                                                                    ',
  '  assign featured = collections["featured"]                                                                                                                                                  ',
  '  assign featured_limit = section.settings.products_to_show | default: 8                                                                                                                    ',
  '  for item in featured.products limit: featured_limit                                                                                                                                        ',
  '    render "card-product", product: item, show_vendor: false, show_quick_add: true, lazy_load: true, section_id: section.id                                                                  ',
  '  endfor                                                                                                                                                                                     ',
  '%}                                                                                                                                                                                           ',
  '',
  '<style>                                                                                                                                                                                      ',
  '  :root { --color-primary: oklch(0.156 0 0); --color-accent: oklch(0.745 0.189 148); --color-background: oklch(0.985 0.001 106); --font-heading: "Geist", system-ui, sans-serif; --font-body: "Geist", system-ui, sans-serif; }',
  '  .hero { min-height: 100vh; display: grid; place-items: center; position: relative; overflow: hidden; }  .hero__background { position: absolute; inset: 0; z-index: 0; }',
  '  .hero__background img { width: 100%; height: 100%; object-fit: cover; }  .hero__container { position: relative; z-index: 1; text-align: center; max-width: 64rem; margin: 0 auto; }',
  '  .hero__heading { font-size: clamp(2.5rem, 6vw, 5rem); letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 1.5rem; }  .hero__body { font-size: 1.125rem; max-width: 42rem; margin: 0 auto; }',
  '  .hero__cta { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.875rem 2.5rem; border-radius: 9999px; font-weight: 500; transition: all 0.2s ease; margin-top: 2rem; }',
  '  .btn--primary { background: var(--color-accent); color: oklch(1 0 0); }  .btn--primary:hover { filter: brightness(1.1); box-shadow: 0 0 30px oklch(0.745 0.189 148 / 0.3); }',
  '',
  '  @media (max-width: 749px) { .hero { min-height: 80vh; } .hero__heading { font-size: clamp(1.75rem, 8vw, 3rem); } .hero__cta { width: 100%; justify-content: center; } }',
  '  @media (min-width: 750px) and (max-width: 989px) { .hero__container { padding: 0 2rem; } }  @media (min-width: 990px) { .hero__container { padding: 0 4rem; } }',
  '</style>                                                                                                                                                                                     ',
  '',
  '{% comment %} Synapse AI — five agents, one workflow. Code · Design · QA · Deploy · Monitor. Generated in 60 seconds. {% endcomment %}                                                      ',
];

const EGG_LINE_HEIGHT = 16;
const EGG_BUFFER = 52;

/* ------------------------------------------------------------------ */
/*  Scrolling code column (one of three)                               */
/* ------------------------------------------------------------------ */

function ScrollColumn({ startIndex, topOffset }: { startIndex: number; topOffset: number }) {
  const [lines, setLines] = useState<string[]>(() =>
    Array.from({ length: EGG_BUFFER }, (_, i) => EGG_LINES[(startIndex + i) % EGG_LINES.length]),
  );
  const nextRef = useRef(startIndex + EGG_BUFFER);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setShift(1);
      setTimeout(() => {
        setLines((prev) => {
          const next = [...prev.slice(1)];
          next.push(EGG_LINES[nextRef.current % EGG_LINES.length]);
          nextRef.current++;
          return next;
        });
        setShift(0);
      }, 350);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <pre
      className="flex-1 font-mono text-[10px] leading-[16px] text-emerald-700/30 dark:text-emerald-400/20 whitespace-pre overflow-hidden"
      style={{
        marginTop: topOffset,
        transform: `translateY(-${shift * EGG_LINE_HEIGHT}px)`,
        transition: shift === 1 ? 'transform 0.4s ease-out' : 'none',
      }}
    >
      {lines.map((line, i) => (
        <div key={`${nextRef.current}-${i}`}>{line || '\u00A0'}</div>
      ))}
    </pre>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero code easter egg — cursor spotlight + fade gradient            */
/* ------------------------------------------------------------------ */

function HeroCodeEasterEgg({ cx, cy }: { cx: number; cy: number }) {
  const spotlight = `radial-gradient(circle 1000px at ${cx}px ${cy}px, black 5%, oklch(0 0 0 / 0.15) 25%, transparent 50%)`;
  const topFade = 'linear-gradient(to bottom, transparent 0%, black 40%)';

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none z-[1] overflow-hidden mix-blend-multiply dark:mix-blend-normal"
      aria-hidden="true"
      style={{
        maskImage: spotlight,
        WebkitMaskImage: spotlight,
      }}
    >
      {/* Code columns — positioned in the lower portion, with a top-fade mask on the wrapper */}
      <div
        className="absolute bottom-0 left-0 right-0 flex gap-8 md:gap-24 px-4 md:px-8 overflow-hidden"
        style={{
          top: '300px',
          maskImage: topFade,
          WebkitMaskImage: topFade,
        }}
      >
        <ScrollColumn startIndex={0} topOffset={0} />
        <ScrollColumn startIndex={18} topOffset={60} />
      </div>
    </div>
  );
}

const entryTransition = (delay: number) => ({
  duration: 0.5,
  delay,
  ease: [0.22, 1, 0.36, 1] as const,
});

const show = { opacity: 1, y: 0 };
const hide = { opacity: 0 };

export default function HeroSection() {
  const ready = usePageReady();
  const { openAuthModal } = useAuthModal();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  // Parallax: mockup stays in place while page scrolls over it
  const mockupY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  // Rotating accent word
  const [wordIndex, setWordIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  // Easter-egg cursor tracking
  const [eggCursor, setEggCursor] = useState<{ cx: number; cy: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleHeroMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (reducedMotion || !sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setEggCursor({ cx, cy });
    },
    [reducedMotion],
  );

  const handleHeroMouseLeave = useCallback(() => {
    setEggCursor(null);
  }, []);

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className="relative bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] overflow-hidden"
      onMouseMove={handleHeroMouseMove}
      onMouseLeave={handleHeroMouseLeave}
    >
      {/* ── Code easter egg — bottom-pinned, cursor spotlight ──────── */}
      {!reducedMotion && eggCursor && (
        <HeroCodeEasterEgg cx={eggCursor.cx} cy={eggCursor.cy} />
      )}

      {/* ── CSS animated gradient blobs ─────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-[0.15] dark:opacity-[0.08]"
          style={{
            background: 'radial-gradient(circle, oklch(0.745 0.189 148) 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '10%',
            left: '15%',
            animation: 'hero-blob-1 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.12] dark:opacity-[0.06]"
          style={{
            background: 'radial-gradient(circle, oklch(0.54 0.24 272) 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '20%',
            right: '10%',
            animation: 'hero-blob-2 25s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[450px] h-[450px] rounded-full opacity-[0.1] dark:opacity-[0.05]"
          style={{
            background: 'radial-gradient(circle, oklch(0.78 0.16 70) 0%, transparent 70%)',
            filter: 'blur(120px)',
            bottom: '15%',
            left: '40%',
            animation: 'hero-blob-3 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-[0.08] dark:opacity-[0.04]"
          style={{
            background: 'radial-gradient(circle, oklch(0.76 0.14 190) 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '50%',
            left: '5%',
            animation: 'hero-blob-2 18s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* Centered gradient glow — full-bleed behind mockup area */}
      <div
        className="absolute left-0 right-0 bottom-0 h-[70%] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 60%, oklch(0.745 0.189 148 / 0.14) 0%, oklch(0.745 0.189 148 / 0.05) 35%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none z-[1]" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-8 md:px-10 z-10">
        <div className="max-w-4xl mx-auto text-center pt-28 md:pt-36">
          {/* Credibility Badge */}
          <motion.span
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-stone-500 dark:text-white/50 mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.3)}
          >
            <Check size={14} />
            Built for Shopify theme developers
          </motion.span>

          {/* Headline */}
          <motion.h1
            className="relative font-medium leading-[1.1] tracking-[-0.03em] text-[clamp(1.75rem,5vw,4rem)] text-stone-900 dark:text-white"
            initial={{ opacity: 0, y: 24 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.4)}
          >
            The only AI IDE that truly understands{' '}
            <PixelAccent>Shopify</PixelAccent>.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="text-lg md:text-xl text-stone-500 dark:text-white/50 mt-6 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.8)}
          >
            Multi-agent AI built for Liquid, sections, variants, schemas, and
            the full Shopify ecosystem. Designed for developers who ship real
            production themes.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(1.0)}
          >
            <MagneticElement strength={6} radius={120}>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="h-12 px-6 sm:px-10 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors w-full sm:w-auto"
              >
                Start Free — No credit card required
              </button>
            </MagneticElement>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 text-sm text-stone-500 dark:text-white/50 hover:text-stone-700 dark:hover:text-white/70 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Watch how it works (47 seconds)
            </a>
          </motion.div>

          {/* Trust line */}
          <motion.p
            className="mt-6 text-sm text-stone-400 dark:text-white/40"
            initial={{ opacity: 0 }}
            animate={ready ? { opacity: 1 } : hide}
            transition={entryTransition(1.2)}
          >
            Used daily by Shopify developers and agencies building real production themes.
          </motion.p>

        </div>

        {/* ── Product mockup — full width, parallax, scroll-animated ── */}
        <motion.div
          id="demo"
          className="relative mt-10 md:mt-14 scroll-mt-20"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={ready ? { opacity: 1, y: 0, scale: 1 } : hide}
          transition={{
            duration: 0.8,
            delay: 1.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ y: mockupY }}
        >
          <div className="relative rounded-2xl overflow-hidden shadow-xl shadow-stone-300/30 dark:shadow-black/30">
            <CodeEditorMockup />
          </div>
        </motion.div>
      </div>

    </section>
  );
}
