'use client';

import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const INFO_CARDS = [
  {
    label: 'Email',
    value: 'hello@synapse.shop',
    href: 'mailto:hello@synapse.shop',
    icon: (
      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    label: 'Support',
    value: 'support@synapse.shop',
    href: 'mailto:support@synapse.shop',
    icon: (
      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    label: 'Location',
    value: 'San Francisco, CA',
    sublabel: 'Remote-first',
    href: undefined,
    icon: (
      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z" />
      </svg>
    ),
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const inputClasses =
  'w-full rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent/30 text-sm';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-16" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            CONTACT
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Get in touch.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-xl mx-auto">
            Have a question, want a demo, or just want to say hello? We&apos;d love to hear from you.
          </p>
        </motion.div>

        {/* Two-column layout */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Left: Contact Form */}
            <motion.div {...fadeUp}>
              <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8">
                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-medium text-stone-900 dark:text-white mb-2">
                      Message sent!
                    </h3>
                    <p className="text-stone-500 dark:text-white/50 text-sm">
                      We&apos;ll get back to you within 24 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1.5"
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        placeholder="Your name"
                        className={inputClasses}
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1.5"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        placeholder="you@company.com"
                        className={inputClasses}
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="subject"
                        className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1.5"
                      >
                        Subject
                      </label>
                      <input
                        type="text"
                        id="subject"
                        name="subject"
                        placeholder="What's this about?"
                        className={inputClasses}
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="message"
                        className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1.5"
                      >
                        Message
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        rows={5}
                        placeholder="Tell us more..."
                        className={`${inputClasses} resize-none`}
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full gradient-accent text-white px-6 py-3 rounded-xl font-semibold text-sm hover:shadow-[0_0_30px_oklch(0.745_0.189_148_/_0.4)] transition-shadow"
                    >
                      Send message
                    </button>
                  </form>
                )}
              </div>
            </motion.div>

            {/* Right: Info Cards */}
            <motion.div className="space-y-6" {...fadeUp}>
              {INFO_CARDS.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-0.5">{card.icon}</div>
                    <div>
                      <h3 className="text-sm font-medium text-stone-500 dark:text-white/50 uppercase tracking-wider mb-1">
                        {card.label}
                      </h3>
                      {card.href ? (
                        <a
                          href={card.href}
                          className="text-stone-900 dark:text-white text-lg font-medium hover:text-accent transition-colors"
                        >
                          {card.value}
                        </a>
                      ) : (
                        <p className="text-stone-900 dark:text-white text-lg font-medium">
                          {card.value}
                        </p>
                      )}
                      {card.sublabel && (
                        <p className="text-stone-400 dark:text-white/30 text-sm mt-0.5">
                          {card.sublabel}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Extra CTA card */}
              <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8">
                <h3 className="text-lg font-medium text-stone-900 dark:text-white mb-2">
                  Looking for support?
                </h3>
                <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed mb-4">
                  Check our documentation for guides, API references, and troubleshooting — or
                  reach out to our support team directly.
                </p>
                <a
                  href="/docs"
                  className="text-accent text-sm font-medium hover:underline"
                >
                  Visit docs &rarr;
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
