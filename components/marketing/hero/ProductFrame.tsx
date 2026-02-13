'use client';

import { useEffect } from 'react';
import { motion, useTransform, useMotionValue, animate, type MotionValue } from 'framer-motion';
import { ReactNode } from 'react';

interface ProductFrameProps {
  children: ReactNode;
  progress: MotionValue<number>;
  pulseTrigger?: number;
  className?: string;
}

export function ProductFrame({ children, progress, pulseTrigger = 0, className = '' }: ProductFrameProps) {
  const scaleBase = useTransform(progress, [0, 0.3, 0.6, 0.8, 1], [0.95, 1, 1.05, 1.05, 0.92]);
  const pulseScale = useMotionValue(1);
  const scale = useTransform([scaleBase, pulseScale], ([s, p]) => (typeof s === 'number' && typeof p === 'number' ? s * p : 1));

  useEffect(() => {
    if (pulseTrigger <= 0) return;
    const ctrl = animate(pulseScale, 1.02, { duration: 0.1, ease: 'easeOut' });
    ctrl.then(() => animate(pulseScale, 1, { duration: 0.15, ease: 'easeIn' }));
    return () => ctrl.stop();
  }, [pulseTrigger, pulseScale]);

  const borderOpacity = useTransform(progress, [0, 0.2, 0.6, 0.8, 1], [0.1, 0.3, 0.6, 0.5, 0.3]);
  const glowIntensity = useTransform(progress, [0, 0.2, 0.6, 0.8, 1], [5, 15, 40, 30, 15]);

  const glowShadow = useTransform(
    glowIntensity,
    (v) => `0 0 ${v}px rgba(14,165,233,${v / 100}), 0 0 ${v * 2}px rgba(14,165,233,${v / 200})`
  );

  const borderColorValue = useTransform(borderOpacity, (v) => `rgba(14,165,233,${v})`);

  const borderPerimeter = 2000;
  const borderDashOffset = useTransform(progress, [0, 0.35], [borderPerimeter, 0]);

  return (
    <motion.div
      className={`relative w-full max-w-3xl mx-auto ${className}`}
      style={{ scale }}
    >
      {/* Glow backdrop */}
      <motion.div
        className="absolute -inset-2 rounded-2xl"
        style={{
          boxShadow: glowShadow,
        }}
      />

      {/* Browser frame */}
      <motion.div
        className="relative rounded-xl overflow-hidden"
        style={{
          border: '1px solid',
          borderColor: borderColorValue,
          background: 'rgba(20, 20, 20, 0.8)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Progressive border draw */}
        <motion.svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          <motion.rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            rx={12}
            ry={12}
            fill="none"
            stroke="rgba(14,165,233,0.6)"
            strokeWidth={1}
            strokeDasharray={borderPerimeter}
            style={{ strokeDashoffset: borderDashOffset }}
          />
        </motion.svg>
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-white/10" />
            <div className="w-3 h-3 rounded-full bg-white/10" />
            <div className="w-3 h-3 rounded-full bg-white/10" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-[11px] text-sky-500/80 font-mono">synapse.shop</span>
          </div>
        </div>

        {/* Content area */}
        <div className="relative aspect-[16/10] overflow-hidden bg-[#0a0a0a]">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
