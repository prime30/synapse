'use client';

import { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

type GlassVariant = 'default' | 'accent' | 'code-texture';
type GlassTheme = 'dark' | 'light';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  variant?: GlassVariant;
  theme?: GlassTheme;
  hoverScale?: boolean;
  hoverGlow?: boolean;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const paddingMap = {
  sm: 'p-4',
  md: 'p-6 md:p-8',
  lg: 'p-8 md:p-12',
};

export function GlassCard({
  children,
  variant = 'default',
  theme = 'dark',
  hoverScale = false,
  hoverGlow = true,
  className = '',
  padding = 'md',
  ...motionProps
}: GlassCardProps) {
  const baseClasses = `
    relative rounded-2xl overflow-hidden
    ${paddingMap[padding]}
    transition-colors duration-300
  `;

  const glassClass = theme === 'light' ? 'glass-light glass-hover' : 'glass-dark glass-hover';
  const variantClasses = {
    default: glassClass,
    accent: 'gradient-accent text-white border border-sky-600/30 shadow-[0_0_24px_rgba(14,165,233,0.3)]',
    'code-texture': glassClass,
  };

  return (
    <motion.div
      className={`group ${baseClasses} ${variantClasses[variant]} ${className}`}
      whileHover={
        hoverScale
          ? {
              scale: 1.02,
              transition: { type: 'spring', stiffness: 300, damping: 20 },
            }
          : undefined
      }
      style={
        hoverGlow
          ? { willChange: 'transform, box-shadow' }
          : undefined
      }
      {...motionProps}
    >
      {variant === 'code-texture' && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] pointer-events-none font-mono text-[8px] leading-[10px] text-sky-500 overflow-hidden whitespace-pre transition-opacity duration-500"
          aria-hidden="true"
        >
          {`{% schema %}
{ "name": "Product", "settings": [] }
{% endschema %}
{% for product in collections.all.products %}
  <div class="product-card">
    {{ product.title }}
    {{ product.price | money }}
  </div>
{% endfor %}
`.repeat(20)}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
