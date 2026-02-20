'use client';

import { useState, useCallback } from 'react';
import { useTransform, motion } from 'framer-motion';
import { useScrollNarrative } from './useScrollNarrative';
import { ProductFrame } from './ProductFrame';
import { ScrollFold } from './ScrollFold';
import { ProgressIndicator } from './ProgressIndicator';
import { TypewriterCode } from './TypewriterCode';
import { Check } from 'lucide-react';

const FOLDS = [
  { label: 'THE PROBLEM', headline: 'Building Shopify themes is painfully slow.', description: 'Manual Liquid templating. No type safety. No AI assistance. Hours of debugging for a single section.' },
  { label: 'ENTER SYNAPSE', headline: 'What if your IDE could think?', description: 'Synapse introduces multi-agent AI that understands Shopify themes at a structural level.' },
  { label: 'THE POWER', headline: 'Three agents. One vision.', description: "A code agent writes. A design agent validates. A QA agent tests. All working in parallel, all understanding your theme's context." },
  { label: 'THE RESULT', headline: 'Ship themes that convert.', description: 'Production-ready Shopify themes, deployed in minutes. Performance-optimized, accessibility-checked, and pixel-perfect.' },
  { label: 'START BUILDING', headline: 'Your next theme starts here.', description: 'No credit card required. Free forever for solo projects.' },
];

function FoldVisual({ foldIndex, onTypingComplete }: { foldIndex: number; onTypingComplete?: () => void }) {
  const visuals = [
    <div key="empty" className="h-full flex flex-col p-4 font-mono text-sm">
      <div className="flex items-center gap-2 mb-3 text-white/30 text-xs">
        <span className="px-2 py-0.5 bg-white/5 rounded text-stone-500/60">theme.liquid</span>
      </div>
      <div className="flex-1 flex items-start">
        <div className="text-white/20 mr-4 text-right select-none" style={{ minWidth: '2ch' }}>{Array.from({ length: 12 }, (_, i) => <div key={i}>{i + 1}</div>)}</div>
        <div className="flex-1"><span className="inline-block w-[2px] h-[18px] bg-accent animate-pulse" /></div>
      </div>
    </div>,
    <TypewriterCode key="typing" onComplete={onTypingComplete} />,
    <div key="agents" className="h-full flex">
      <div className="w-1/4 border-r border-white/5 p-3 text-xs">
        <div className="text-white/50 font-pixel text-[8px] tracking-wider mb-2">FILES</div>
        {['layout/theme.liquid', 'sections/hero.liquid', 'sections/product.liquid', 'assets/theme.css', 'snippets/price.liquid'].map((f, i) => (
          <div key={f} className={`py-1.5 px-2 rounded text-[11px] ${i === 1 ? 'bg-accent/10 text-accent' : 'text-white/60'}`}>{f.split('/').pop()}</div>
        ))}
        <div className="mt-6 space-y-2">
          {['Code', 'Design', 'QA'].map((name, i) => (
            <div key={name} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${['bg-green-500', 'bg-accent', 'bg-purple-400'][i]} animate-pulse`} style={{ animationDelay: `${i * 0.5}s` }} />
              <span className="text-[10px] text-white/60">{name} Agent</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-3 font-mono text-[11px] leading-5 text-white/70">
        <div><span className="text-cyan-500">{'{% schema %}'}</span></div>
        <div>{'  { '}<span className="text-accent">&quot;name&quot;</span>{': '}<span className="text-accent">&quot;Hero Banner&quot;</span>{' }'}</div>
        <div><span className="text-cyan-500">{'{% endschema %}'}</span></div>
        <div className="mt-2"><span className="text-white/30">{'<!-- AI-generated section -->'}</span></div>
        <div>{'<section class='}<span className="text-accent">&quot;hero&quot;</span>{'>'}</div>
        <div>{'  <h1>'}<span className="text-cyan-500">{'{{ heading }}'}</span>{'</h1>'}</div>
        <div>{'  <div class='}<span className="text-accent">&quot;hero__cta&quot;</span>{'>'}</div>
        <div>{'    <a href='}<span className="text-accent">&quot;#&quot;</span>{'>'}<span className="text-cyan-500">{'{{ cta_text }}'}</span>{'</a>'}</div>
        <div>{'  </div>'}</div><div>{'</section>'}</div>
      </div>
    </div>,
    <div key="result" className="h-full flex">
      <div className="w-1/3 border-r border-white/5 p-3 font-mono text-[10px] leading-4 text-white/40 overflow-hidden">
        <div className="text-cyan-500/60">{'{% section %}'}</div>
        <div className="text-white/20">{'...'}</div>
        <div className="mt-4 flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500/20 flex items-center justify-center text-green-400"><Check size={10} strokeWidth={2} /></div>
          <span className="text-green-400/60 text-[10px]">All checks passed</span>
        </div>
      </div>
      <div className="flex-1 bg-white p-4 flex flex-col">
        <div className="bg-stone-50 dark:bg-stone-900 rounded-lg flex-1 p-6 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-stone-200 dark:bg-stone-800 rounded-lg mb-4" />
          <div className="h-3 w-32 bg-stone-300 dark:bg-stone-700 rounded mb-2" />
          <div className="h-2 w-48 bg-stone-200 dark:bg-stone-800 rounded mb-4" />
          <div className="h-8 w-24 bg-accent rounded-full" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded">Lighthouse 98</span>
            <span className="text-[10px] text-accent font-medium bg-accent/10 px-2 py-0.5 rounded inline-flex items-center gap-1">WCAG AA <Check size={10} strokeWidth={2} /></span>
          </div>
          <button className="text-[10px] bg-accent text-white px-3 py-1 rounded-full font-medium">Deploy</button>
        </div>
      </div>
    </div>,
    <div key="cta" className="h-full flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl bg-accent/20 flex items-center justify-center">
          <span className="text-accent text-lg font-semibold font-pixel">S</span>
        </div>
        <p className="text-white/60 text-sm">Ready when you are.</p>
      </div>
    </div>,
  ];
  return <div className="absolute inset-0">{visuals[foldIndex]}</div>;
}


export function ScrollHero() {
  const { containerRef, scrollYProgress, foldIndex } = useScrollNarrative();
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const onTypingComplete = useCallback(() => setPulseTrigger((n) => n + 1), []);

  const copyX = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [0, 0, -280, 24, 280, 0]);
  const copyWidth = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], ['100%', '50%', '38%', '50%', '100%', '100%']);
  const copyY = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [0, 0, 80, 0, 0, 0]);
  const frameX = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [400, 0, 0, 0, 0, 0]);
  const frameWidth = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], ['45%', '45%', '90vw', '45%', '45%', '42%']);
  const frameScale = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [0.9, 1, 1, 1, 1, 0.85]);
  const frameOpacity = useTransform(scrollYProgress, [0, 0.15, 0.25, 1], [0, 0, 1, 1]);
  const copyOpacity = useTransform(scrollYProgress, [0.35, 0.45], [1, 0]);
  const copyOpacity2 = useTransform(scrollYProgress, [0.45, 0.55], [0, 1]);

  const backgroundGradient = useTransform(
    scrollYProgress,
    (v) => `radial-gradient(ellipse at 50% 50%, rgba(14,165,233,${0.02 + v * 0.06}) 0%, rgba(10,10,10,1) 70%)`
  );
  const heroOpacity = useTransform(scrollYProgress, [0.85, 1], [1, 0]);

  const handleFoldClick = (index: number) => {
    if (!containerRef.current) return;
    const containerTop = containerRef.current.offsetTop;
    const containerHeight = containerRef.current.scrollHeight - window.innerHeight;
    const targetScroll = containerTop + (index / 5) * containerHeight;
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  };

  return (
    <section ref={containerRef} className="relative" style={{ height: '500vh' }}>
      <motion.div className="group sticky top-0 h-screen overflow-hidden" style={{ opacity: heroOpacity }}>
        <motion.div className="absolute inset-0 bg-[#0a0a0a]" style={{ background: backgroundGradient }} />

        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] pointer-events-none font-mono text-[9px] leading-[13px] text-stone-500 dark:text-stone-400 whitespace-pre overflow-hidden select-none transition-opacity duration-500"
          aria-hidden="true"
          style={{ animation: 'code-scroll-up 60s linear infinite' }}
        >
          {`{% schema %}
  { "name": "Hero", "settings": [] }
{% endschema %}
{% for product in collection.products %}
  {{ product.title | escape }}
  {{ product.price | money }}
{% endfor %}
`.repeat(30)}
        </div>

        <div className="relative h-full w-full flex items-center justify-center">
          {/* Copy panel — position interpolated by scroll */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center md:justify-start md:pl-12 lg:pl-20"
            style={{ x: copyX, width: copyWidth, y: copyY }}
          >
            <motion.div className="w-full max-w-2xl" style={{ opacity: copyOpacity }}>
              {FOLDS.map((fold, index) => (
                <ScrollFold
                  key={fold.label}
                  isActive={foldIndex === index}
                  label={fold.label}
                  headline={fold.headline}
                  description={fold.description}
                  alignment={index === 0 || index === 4 ? 'center' : 'left'}
                  ctaButtons={
                    index === 4 ? (
                      <>
                        <a href="/signup" className="inline-flex items-center justify-center px-10 py-3.5 gradient-accent text-white font-semibold rounded-full text-lg hover:shadow-[0_0_30px_rgba(40,205,86,0.35)] transition-shadow focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]">Start Free</a>
                        <a href="#demo" className="inline-flex items-center justify-center px-10 py-3.5 glass-dark rounded-full text-white font-medium text-lg focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]">Watch Demo</a>
                      </>
                    ) : undefined
                  }
                >
                  {index === 0 && (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full max-w-md">
                        <input
                          type="email"
                          placeholder="Enter your email"
                          className="w-full sm:flex-1 h-12 px-4 rounded-full glass-dark text-white placeholder:text-white/40 focus:outline-none focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] transition-colors"
                          aria-label="Email"
                        />
                        <a href="/signup" className="w-full sm:w-auto inline-flex items-center justify-center px-10 py-3.5 gradient-accent text-white font-semibold rounded-full hover:shadow-[0_0_30px_rgba(40,205,86,0.35)] transition-shadow shrink-0 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]">Start Free</a>
                      </div>
                      <a href="#demo" className="inline-flex items-center justify-center px-10 py-3.5 glass-dark rounded-full text-white font-medium focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]">Watch Demo</a>
                    </div>
                  )}
                </ScrollFold>
              ))}
            </motion.div>
            {/* Fold 2 overlay: glass card bottom-left */}
            <motion.div
              className="absolute left-6 lg:left-12 bottom-12 w-[90%] max-w-md glass-dark rounded-2xl p-6 md:p-8"
              style={{ opacity: copyOpacity2 }}
            >
              <span className="font-pixel text-[11px] tracking-[0.3em] text-stone-500 dark:text-stone-400 mb-3 block">{FOLDS[2].label}</span>
              <h2 className="text-2xl md:text-3xl font-semibold text-white mb-3">{FOLDS[2].headline}</h2>
              <p className="text-white/70 text-sm md:text-base">{FOLDS[2].description}</p>
            </motion.div>
          </motion.div>

          {/* Product frame — position and size interpolated */}
          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ x: frameX, width: frameWidth, opacity: frameOpacity }}
          >
            <motion.div style={{ scale: frameScale }} className="w-full max-w-3xl mx-auto">
              <ProductFrame progress={scrollYProgress} pulseTrigger={pulseTrigger}>
                <FoldVisual foldIndex={foldIndex} onTypingComplete={onTypingComplete} />
              </ProductFrame>
            </motion.div>
          </motion.div>
        </div>

        <ProgressIndicator activeFold={foldIndex} onFoldClick={handleFoldClick} />
      </motion.div>
    </section>
  );
}





