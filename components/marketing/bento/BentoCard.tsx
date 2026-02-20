'use client';

import { ReactNode, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type CardSize = '1x1' | '2x1' | '1x2' | '2x2';
type CardVariant = 'glass' | 'accent' | 'code-texture';
type CardTheme = 'dark' | 'light';

interface BentoCardProps {
  children: ReactNode;
  size?: CardSize;
  variant?: CardVariant;
  theme?: CardTheme;
  label?: string;
  title?: string;
  description?: string;
  className?: string;
  href?: string;
}

const sizeClasses: Record<CardSize, string> = {
  '1x1': 'col-span-1 row-span-1',
  '2x1': 'col-span-1 md:col-span-2 row-span-1',
  '1x2': 'col-span-1 row-span-1 md:row-span-2',
  '2x2': 'col-span-1 md:col-span-2 row-span-1 md:row-span-2',
};

function getVariantClasses(variant: CardVariant, theme: CardTheme): string {
  if (variant === 'accent') return 'gradient-accent text-white border border-accent/30 shadow-[0_0_24px_rgba(40,205,86,0.25)]';
  const glass = theme === 'light' ? 'glass-light' : 'glass-dark';
  return variant === 'code-texture' ? glass : glass;
}

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function BentoCard({
  children,
  size = '1x1',
  variant = 'glass',
  theme = 'dark',
  label,
  title,
  description,
  className = '',
  href,
}: BentoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const content = (
    <>
      {variant !== 'accent' && isHovered && (
        <div
          className="absolute inset-0 pointer-events-none opacity-40 transition-opacity duration-300"
          style={{
            background: `radial-gradient(300px circle at ${mousePos.x}% ${mousePos.y}%, rgba(14,165,233,0.12), transparent)`,
          }}
        />
      )}

      {variant === 'code-texture' && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] pointer-events-none font-mono text-[8px] leading-[10px] text-stone-500 dark:text-stone-400 overflow-hidden whitespace-pre select-none transition-opacity duration-500"
          aria-hidden="true"
        >
          {`{% for product in collection.products %}
  <div class="product-card">
    {{ product.title }}
    {{ product.price | money }}
  </div>
{% endfor %}
{% schema %}
  { "name": "Section", "settings": [] }
{% endschema %}
`.repeat(10)}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {label && (
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-3">
            {label}
          </span>
        )}
        {title && (
          <h3 className={`text-xl md:text-2xl font-semibold mb-2 ${variant === 'accent' ? 'text-white' : theme === 'light' ? 'text-stone-900' : 'text-white'}`}>
            {title}
          </h3>
        )}
        {description && (
          <p className={`text-sm leading-relaxed mb-4 ${variant === 'accent' ? 'text-white/90' : theme === 'light' ? 'text-stone-500' : 'text-white/70'}`}>
            {description}
          </p>
        )}
        <div className="flex-1">{children}</div>

        {href && (
          <motion.div
            className="mt-4"
            initial={{ opacity: 0, y: 10 }}
            animate={isHovered ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <span className={`text-sm font-medium ${variant === 'accent' ? 'text-white' : 'text-accent'}`}>
              Learn more &rarr;
            </span>
          </motion.div>
        )}
      </div>
    </>
  );

  return (
    <motion.div
      ref={cardRef}
      className={`
        group relative rounded-2xl overflow-hidden p-6 md:p-8
        ${sizeClasses[size]}
        ${getVariantClasses(variant, theme)}
        cursor-pointer
        transition-all duration-300
        hover:border-accent/20 hover:shadow-[0_8px_30px_rgba(40,205,86,0.08)]
        ${className}
      `}
      variants={itemVariants}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {content}
    </motion.div>
  );
}
