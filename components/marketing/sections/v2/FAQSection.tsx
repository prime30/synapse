'use client';

import { useRef, useState, useCallback } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  FAQ data                                                           */
/* ------------------------------------------------------------------ */

const FAQ_ITEMS = [
  {
    question: 'Do I need to install anything?',
    answer:
      'No. Synapse is a browser-based Shopify theme IDE. Connect your store, open a theme, and start editing. No local setup, no CLI, and no Node version to manage.',
  },
  {
    question: 'Can I use Synapse with my existing Shopify theme?',
    answer:
      'Yes. Synapse works with any Shopify theme — Dawn, custom builds, or third-party themes. Connect your store, select your theme, and import it. You edit the same files as in Shopify admin, with Liquid completions, go-to-definition, and live preview.',
  },
  {
    question: 'Is my store data safe?',
    answer:
      "We connect through Shopify's official OAuth APIs with encrypted tokens. We don't store your product, customer, or order data. Theme files sync securely. You control access and can disconnect at any time.",
  },
  {
    question: 'Can my team use this?',
    answer:
      'Yes. Role-based deploy approval lets members request publishes and admins approve. Inline code comments with threaded replies keep discussions next to the code. Everyone works in the same browser-based workspace.',
  },
  {
    question: 'What if I go offline?',
    answer:
      "Changes queue locally and sync when you're back online. The theme console and command palette keep working. You don't lose progress.",
  },
  {
    question: 'How does the AI compare to Copilot or Cursor?',
    answer:
      "Synapse's agents are built specifically for Shopify. They understand Liquid objects, section schemas, theme structure, and Shopify conventions. A generic AI can suggest code — our five specialists suggest the right code for your store.",
  },
];

/* ------------------------------------------------------------------ */
/*  Single FAQ item                                                    */
/* ------------------------------------------------------------------ */

function FAQItem({
  item,
  index,
  isOpen,
  onToggle,
  inView,
}: {
  item: (typeof FAQ_ITEMS)[number];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  inView: boolean;
}) {
  return (
    <motion.div
      className="rounded-xl bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{
        duration: 0.5,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      itemScope
      itemType="https://schema.org/Question"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left px-6 py-5 gap-4 cursor-pointer"
        aria-expanded={isOpen}
      >
        <span
          className="text-base font-medium text-stone-900 dark:text-white"
          itemProp="name"
        >
          {item.question}
        </span>
        <motion.span
          className="shrink-0 text-stone-400 dark:text-white/40"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            itemScope
            itemType="https://schema.org/Answer"
          >
            <div className="px-6 pb-5">
              <p
                className="text-[15px] text-stone-500 dark:text-white/50 leading-relaxed"
                itemProp="text"
              >
                {item.answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQSection                                                         */
/* ------------------------------------------------------------------ */

export default function FAQSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = useCallback(
    (index: number) => {
      setOpenIndex((prev) => (prev === index ? null : index));
    },
    []
  );

  return (
    <section
      ref={ref}
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
      itemScope
      itemType="https://schema.org/FAQPage"
    >
      <div className="max-w-3xl mx-auto px-8 md:px-10 py-16 md:py-24">
        {/* Heading */}
        <motion.h2
          className="text-3xl md:text-4xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Questions we get a lot
        </motion.h2>

        {/* Accordion */}
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem
              key={item.question}
              item={item}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => toggle(i)}
              inView={inView}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
