'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';

type CardType = 'blank' | 'code' | 'agents' | 'sync' | 'versions' | 'liquid';

const CARDS: { type: CardType }[] = [
  { type: 'code' }, { type: 'blank' }, { type: 'agents' }, { type: 'blank' },
  { type: 'sync' }, { type: 'blank' }, { type: 'versions' }, { type: 'blank' },
  { type: 'liquid' }, { type: 'blank' }, { type: 'blank' }, { type: 'blank' },
];

function MiniCodeCard() {
  return (
    <div className="p-2 font-mono text-[8px] leading-tight">
      <div><span className="text-cyan-400">&#123;% schema %&#125;</span></div>
      <div className="text-white/50">  &quot;name&quot;: &quot;hero&quot;</div>
      <div><span className="text-cyan-400">&#123;% endschema %&#125;</span></div>
      <div className="text-white/40">&#123;&#123; section.settings...</div>
    </div>
  );
}

function MiniAgentsCard() {
  const items = ['Code', 'Design', 'QA'];
  const colors = ['bg-green-500', 'bg-blue-400', 'bg-purple-400'];
  return (
    <div className="p-2 flex flex-col gap-1.5">
      {items.map((name, i) => (
        <div key={name} className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${colors[i]}`} />
          <span className="text-[8px] text-white/60">{name}</span>
        </div>
      ))}
    </div>
  );
}

function MiniSyncCard() {
  return (
    <div className="p-2 space-y-1">
      <div className="flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-[8px] text-green-400">Connected</span>
      </div>
      <div className="text-[8px] text-white/40">my-store.myshopify.com</div>
    </div>
  );
}

function MiniVersionsCard() {
  return (
    <div className="p-2 flex gap-1">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex-1 h-4 rounded bg-white/10" />
      ))}
    </div>
  );
}

function MiniLiquidCard() {
  return (
    <div className="p-2 flex items-center gap-1">
      <div className="w-2 h-2 rounded border border-green-500/50 flex items-center justify-center">
        <span className="text-[6px] text-green-400">&#10003;</span>
      </div>
      <span className="text-[8px] text-white/50">Valid</span>
    </div>
  );
}

function CardContent({ type }: { type: CardType }) {
  switch (type) {
    case 'code': return <MiniCodeCard />;
    case 'agents': return <MiniAgentsCard />;
    case 'sync': return <MiniSyncCard />;
    case 'versions': return <MiniVersionsCard />;
    case 'liquid': return <MiniLiquidCard />;
    default: return null;
  }
}

export function IsometricHeroGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: false, margin: '-40px' });
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 0.4], [0, -40]);

  const maskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
  };

  return (
    <motion.div
      ref={containerRef}
      className="max-w-5xl mx-auto mt-12 md:mt-16 px-6 pb-20 overflow-hidden"
      style={{ y }}
    >
      <div className="relative mx-auto" style={{ perspective: 1200, width: 'min(90vw, 640px)' }}>
        <div className="absolute inset-0 z-10 pointer-events-none" style={maskStyle} />
        <motion.div
          className="grid grid-cols-4 gap-2 md:gap-3"
          style={{ transform: 'rotateX(55deg) rotateZ(-35deg)', transformStyle: 'preserve-3d' }}
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {CARDS.map((card, i) => (
            <motion.div
              key={i}
              className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm min-h-[72px] md:min-h-[88px] overflow-hidden flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
            >
              {card.type === 'blank' ? (
                <span className="text-stone-200 dark:text-white/10 text-[10px]" aria-hidden>-</span>
              ) : (
                <div className="w-full h-full min-h-[72px] md:min-h-[88px] bg-[#0a0a0a] dark:bg-[#111] rounded-xl">
                  <CardContent type={card.type} />
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
