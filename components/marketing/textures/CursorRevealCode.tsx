'use client';

import { useEffect, useRef, useState } from 'react';

const CODE = `{% schema %}
  { "name": "Hero Banner",
    "settings": [
      { "type": "text", "id": "heading" },
      { "type": "richtext", "id": "body" },
      { "type": "url", "id": "cta_link" }
    ],
    "presets": [{ "name": "Hero" }]
  }
{% endschema %}

{% assign heading = section.settings.heading %}
{% if heading != blank %}
  <section class="hero" data-section="{{ section.id }}">
    <h1>{{ heading | escape }}</h1>
    {% if section.settings.body != blank %}
      {{ section.settings.body }}
    {% endif %}
  </section>
{% endif %}

{% for product in collection.products limit: 12 %}
  {% render 'product-card',
    product: product,
    show_vendor: section.settings.show_vendor
  %}
{% endfor %}

{{ 'theme.css' | asset_url | stylesheet_tag }}
{{ 'application.js' | asset_url | script_tag }}

{% liquid
  assign featured = collections['featured']
  for item in featured.products
    render 'card', product: item
  endfor
%}

<style>
  :root {
    --color-primary: #0c0c0c;
    --color-accent: #28CD56;
    --font-heading: 'Geist', sans-serif;
  }
  .hero { min-height: 100vh; display: grid; }
  .hero h1 {
    font-size: clamp(2.5rem, 6vw, 5rem);
    letter-spacing: -0.02em;
  }
</style>

{% comment %}
  Synapse AI — five agents, one workflow.
  Code · Design · QA · Deploy · Monitor
{% endcomment %}`;

// Repeat to fill a tall page
const FULL_CODE = (CODE + '\n\n').repeat(6);

// Split into columns for a texture feel
const COLUMNS = 3;

export function CursorRevealCode() {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Only render the code text client-side so it's never in the SSR HTML
  // (prevents crawlers from indexing decorative Liquid code as page content)
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip mousemove tracking on touch devices — the reveal effect is mouse-only
    const isTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) return;

    const onMove = (e: MouseEvent) => {
      el.style.setProperty('--rx', `${e.clientX}px`);
      el.style.setProperty('--ry', `${e.clientY + window.scrollY}px`);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (!mounted) return null;

  return (
    <div
      ref={ref}
      data-nosnippet=""
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-0 overflow-hidden"
      aria-hidden="true"
      style={{
        ['--rx' as string]: '-9999px',
        ['--ry' as string]: '-9999px',
        maskImage: 'radial-gradient(circle 180px at var(--rx) var(--ry), black 0%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(circle 180px at var(--rx) var(--ry), black 0%, transparent 100%)',
      }}
    >
      <div className="flex gap-12 px-8 py-4 max-w-6xl mx-auto">
        {Array.from({ length: COLUMNS }).map((_, i) => (
          <pre
            key={i}
            className="flex-1 font-mono text-[10px] leading-[16px] text-stone-400/60 dark:text-white/[0.12] whitespace-pre overflow-hidden"
            style={{ marginTop: i * 60 }}
          >
            {FULL_CODE}
          </pre>
        ))}
      </div>
    </div>
  );
}
