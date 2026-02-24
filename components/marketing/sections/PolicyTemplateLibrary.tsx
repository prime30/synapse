'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  RotateCcw,
  Shield,
  FileText,
  Truck,
  Mail,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Template data                                                       */
/* ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    id: 'return',
    title: 'Return & Refund Policy',
    description:
      'Return windows, hygiene requirements, color matching exchanges, and refund process.',
    icon: RotateCcw,
    color: 'text-rose-500',
    colorBg: 'bg-rose-500/10',
    html: `<!-- Return and Refund Policy Template -->
<!-- DISCLAIMER: This template is not legal advice. Consult an attorney. -->
<!-- Replace [STORE_NAME], [STORE_EMAIL], etc. with your details -->

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Return Eligibility</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We accept returns within <strong>[RETURN_WINDOW_DAYS] days</strong> of delivery. Items must be unopened, unused, and in their original packaging.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Hygiene Policy</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">For hygiene reasons, products that have been opened, tried on, or used are <strong>final sale</strong> and cannot be returned or exchanged.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">How to Start a Return</h2>
<ol style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;">Email <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a> with your order number</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">We'll send a return shipping label within 24 hours</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Ship items back using the provided label</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Refund processed within 5-7 business days</li>
</ol>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Refund Method</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Refunds are issued to your original payment method. Shipping costs are non-refundable.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  Questions? Contact <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`,
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    description:
      'Data collection, cookies, third-party sharing, customer rights, and GDPR basics.',
    icon: Shield,
    color: 'text-sky-500',
    colorBg: 'bg-sky-500/10',
    html: `<!-- Privacy Policy Template -->
<!-- DISCLAIMER: This template is not legal advice. Consult an attorney. -->
<!-- Replace [STORE_NAME], [STORE_EMAIL], [STORE_URL] with your details -->

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Information We Collect</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">When you visit <strong>[STORE_URL]</strong>, we collect certain information about your device, your interaction with the store, and information necessary to process your purchases.</p>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;"><strong>Order information:</strong> name, billing address, shipping address, payment information, email address, and phone number</li>
  <li style="margin-bottom: 6px; line-height: 1.5;"><strong>Device information:</strong> web browser, IP address, time zone, cookies installed on your device</li>
  <li style="margin-bottom: 6px; line-height: 1.5;"><strong>Browsing information:</strong> products viewed, search terms, how you interact with the site</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">How We Use Your Information</h2>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;">Fulfill orders and process payments</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Communicate with you about orders, promotions, and updates</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Screen orders for fraud and risk</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Improve and optimize our store</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Sharing Your Information</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We share your personal information with third parties to help us process payments (Shopify Payments, Stripe, PayPal), fulfill orders (shipping carriers), and market our products (email platforms). We do not sell your personal data.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Your Rights</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">If you are a European resident, you have the right to access, correct, update, or request deletion of your personal information. Contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Cookies</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We use cookies to maintain your shopping session, remember your preferences, and understand how you use our store. You can control cookies through your browser settings.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  Questions? Contact <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`,
  },
  {
    id: 'terms',
    title: 'Terms of Service',
    description:
      'Site usage terms, intellectual property, liability limits, and governing law.',
    icon: FileText,
    color: 'text-amber-500',
    colorBg: 'bg-amber-500/10',
    html: `<!-- Terms of Service Template -->
<!-- DISCLAIMER: This template is not legal advice. Consult an attorney. -->
<!-- Replace [STORE_NAME], [STORE_EMAIL], [STORE_URL], [YOUR_STATE] with your details -->

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Overview</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">This website is operated by <strong>[STORE_NAME]</strong>. By visiting our site and/or purchasing something from us, you agree to be bound by the following terms and conditions.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Online Store Terms</h2>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;">You must be at least 18 years old or the age of majority in your jurisdiction</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">You may not use our products for any illegal or unauthorized purpose</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">A breach of any of the terms will result in immediate termination of your access</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Accuracy of Information</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We are not responsible if information made available on this site is not accurate, complete, or current. Content is provided for general information only and should not be relied upon as the sole basis for making decisions.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Pricing and Availability</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Prices for our products are subject to change without notice. We reserve the right to modify or discontinue any product without notice. We are not liable for any modification, price change, suspension, or discontinuation.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Limitation of Liability</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">In no case shall <strong>[STORE_NAME]</strong>, our directors, officers, employees, or affiliates be liable for any injury, loss, claim, or damages of any kind arising from the use of our products or site.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Governing Law</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">These Terms of Service shall be governed by and construed in accordance with the laws of <strong>[YOUR_STATE]</strong>.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  Questions? Contact <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`,
  },
  {
    id: 'shipping',
    title: 'Shipping Policy',
    description:
      'Processing times, shipping methods, tracking, international orders, and delays.',
    icon: Truck,
    color: 'text-emerald-500',
    colorBg: 'bg-emerald-500/10',
    html: `<!-- Shipping Policy Template -->
<!-- DISCLAIMER: This template is not legal advice. Consult an attorney. -->
<!-- Replace [STORE_NAME], [STORE_EMAIL] with your details -->

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Processing Time</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Orders are processed within <strong>1-3 business days</strong>. Orders placed on weekends or holidays are processed the next business day.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Shipping Methods &amp; Rates</h2>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
  <thead>
    <tr style="border-bottom: 2px solid #e5e5e5;">
      <th style="text-align: left; padding: 8px 12px; font-weight: 600; color: #1a1a1a;">Method</th>
      <th style="text-align: left; padding: 8px 12px; font-weight: 600; color: #1a1a1a;">Estimated Delivery</th>
      <th style="text-align: left; padding: 8px 12px; font-weight: 600; color: #1a1a1a;">Cost</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px; color: #444;">Standard Shipping</td>
      <td style="padding: 8px 12px; color: #444;">5-8 business days</td>
      <td style="padding: 8px 12px; color: #444;">$4.99 (free over $75)</td>
    </tr>
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px; color: #444;">Express Shipping</td>
      <td style="padding: 8px 12px; color: #444;">2-3 business days</td>
      <td style="padding: 8px 12px; color: #444;">$12.99</td>
    </tr>
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px; color: #444;">International</td>
      <td style="padding: 8px 12px; color: #444;">10-20 business days</td>
      <td style="padding: 8px 12px; color: #444;">Calculated at checkout</td>
    </tr>
  </tbody>
</table>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Order Tracking</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">You'll receive a shipping confirmation email with a tracking number once your order ships. Please allow 24-48 hours for tracking information to update.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">International Orders</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">International customers are responsible for all duties, import taxes, and brokerage fees. These charges are not included in the product price or shipping cost.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Delays</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">While we strive for timely delivery, delays may occur due to weather, carrier issues, or high demand. <strong>[STORE_NAME]</strong> is not responsible for delays once a package is in the carrier's possession.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  Questions? Contact <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`,
  },
  {
    id: 'contact',
    title: 'Contact Information',
    description:
      'Business contact details, support hours, response times, and social links.',
    icon: Mail,
    color: 'text-violet-500',
    colorBg: 'bg-violet-500/10',
    html: `<!-- Contact Information Page Template -->
<!-- DISCLAIMER: This template is not legal advice. Consult an attorney. -->
<!-- Replace [STORE_NAME], [STORE_EMAIL], [STORE_PHONE], [STORE_ADDRESS], [STORE_URL] with your details -->

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Get in Touch</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We'd love to hear from you! Whether you have a question about an order, a product, or anything else, our team is ready to help.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Contact Details</h2>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444; list-style: none;">
  <li style="margin-bottom: 8px; line-height: 1.5;"><strong>Email:</strong> <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a></li>
  <li style="margin-bottom: 8px; line-height: 1.5;"><strong>Phone:</strong> [STORE_PHONE]</li>
  <li style="margin-bottom: 8px; line-height: 1.5;"><strong>Address:</strong> [STORE_ADDRESS]</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Support Hours</h2>
<table style="width: 100%; max-width: 400px; border-collapse: collapse; margin-bottom: 16px;">
  <tbody>
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px; font-weight: 600; color: #1a1a1a;">Monday - Friday</td>
      <td style="padding: 8px 12px; color: #444;">9:00 AM - 6:00 PM EST</td>
    </tr>
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px; font-weight: 600; color: #1a1a1a;">Saturday</td>
      <td style="padding: 8px 12px; color: #444;">10:00 AM - 4:00 PM EST</td>
    </tr>
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px; font-weight: 600; color: #1a1a1a;">Sunday</td>
      <td style="padding: 8px 12px; color: #444;">Closed</td>
    </tr>
  </tbody>
</table>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Response Time</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We aim to respond to all inquiries within <strong>24 hours</strong> during business days. During peak seasons, response times may be slightly longer.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  Visit us at <a href="[STORE_URL]" style="color: #0066cc; text-decoration: underline;">[STORE_URL]</a>
</p>`,
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]['id'];

const ease = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function PolicyTemplateLibrary() {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: '-60px' });
  const [selected, setSelected] = useState<TemplateId | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = TEMPLATES.find((t) => t.id === selected);

  const handleSelect = (id: TemplateId) => {
    setSelected((prev) => (prev === id ? null : id));
    setTimeout(() => {
      codeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCopy = async (id: string, html: string) => {
    await navigator.clipboard.writeText(html);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: TemplateId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(id);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="py-20 md:py-28 lg:py-36 bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10">
        {/* Hero */}
        <motion.div
          className="text-center mb-16 md:mb-20"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease }}
        >
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-5">
            Tools
          </span>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-[-0.02em] leading-[1.05] text-stone-900 dark:text-white mb-4">
            Shopify Policy Page Templates
          </h1>
          <p className="text-base md:text-lg text-stone-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Free, clean HTML templates for your Shopify policy pages. Pick a
            template, copy the HTML, and paste it into your Shopify admin.
          </p>
        </motion.div>

        {/* Card grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10"
          role="tablist"
          aria-label="Policy template selector"
        >
          {TEMPLATES.map((tmpl, i) => {
            const Icon = tmpl.icon;
            const isActive = selected === tmpl.id;
            return (
              <motion.div
                key={tmpl.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                aria-label={`${tmpl.title} template`}
                className={`rounded-xl border p-6 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-[oklch(0.745_0.189_148)] ring-2 ring-[oklch(0.745_0.189_148)] bg-white dark:bg-white/5'
                    : 'border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-stone-300 dark:hover:border-white/20'
                }`}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: 0.08 * i,
                  ease,
                }}
                onClick={() => handleSelect(tmpl.id)}
                onKeyDown={(e) => handleKeyDown(e, tmpl.id)}
              >
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${tmpl.colorBg} mb-4`}
                >
                  <Icon className={`w-5 h-5 ${tmpl.color}`} />
                </div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-white mb-1.5 flex items-center gap-2">
                  {tmpl.title}
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-[oklch(0.745_0.189_148)]" />
                  )}
                </h3>
                <p className="text-sm text-stone-500 dark:text-gray-400 leading-relaxed">
                  {tmpl.description}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Expanded code block */}
        {selectedTemplate && (
          <motion.div
            ref={codeRef}
            className="rounded-lg overflow-hidden bg-stone-950 dark:bg-[oklch(0.162_0_0)]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-stone-900 dark:bg-white/10 border-b border-stone-800">
              <span className="text-sm font-medium text-stone-300">
                {selectedTemplate.title} — HTML
              </span>
              <button
                onClick={() =>
                  handleCopy(selectedTemplate.id, selectedTemplate.html)
                }
                className="inline-flex items-center gap-1.5 bg-[oklch(0.745_0.189_148)] hover:bg-[oklch(0.684_0.178_149)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                aria-label={`Copy ${selectedTemplate.title} HTML`}
              >
                {copied === selectedTemplate.id ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span aria-live="polite">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy HTML
                  </>
                )}
              </button>
            </div>

            {/* Code */}
            <pre className="font-mono text-[13px] leading-relaxed text-stone-300 p-4 overflow-x-auto whitespace-pre-wrap max-h-[500px] overflow-y-auto">
              <code>{selectedTemplate.html}</code>
            </pre>

            {/* Instructions */}
            <div className="px-4 py-3 border-t border-stone-800 bg-stone-900/50 dark:bg-white/5">
              <p className="text-xs text-stone-400 dark:text-gray-500 leading-relaxed">
                Paste into{' '}
                <span className="text-stone-300 dark:text-gray-300 font-medium">
                  Shopify Admin &rarr; Settings &rarr; Policies &rarr;{' '}
                  {selectedTemplate.title}
                </span>{' '}
                &rarr; click the HTML button{' '}
                <code className="text-stone-300 dark:text-gray-300 font-mono bg-stone-800 dark:bg-white/10 px-1 py-0.5 rounded text-[11px]">
                  {'</>'}
                </code>
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
