'use client';

import { useMemo } from 'react';

const CODE_SNIPPETS: Record<string, string> = {
  liquid: `{% schema %}
  { "name": "Hero Banner",
    "settings": [
      { "type": "text", "id": "heading", "label": "Heading" },
      { "type": "richtext", "id": "text", "label": "Text" },
      { "type": "url", "id": "link", "label": "Button URL" }
    ]
  }
{% endschema %}

{% assign heading = section.settings.heading %}
{% if heading != blank %}
  <section class="hero-banner">
    <div class="hero-banner__content">
      <h1 class="hero-banner__heading">{{ heading }}</h1>
      {% if section.settings.text != blank %}
        <div class="hero-banner__text">
          {{ section.settings.text }}
        </div>
      {% endif %}
      {% if section.settings.link != blank %}
        <a href="{{ section.settings.link }}" class="btn btn--primary">
          Shop Now
        </a>
      {% endif %}
    </div>
  </section>
{% endif %}

{% for product in collection.products %}
  {% render 'product-card', product: product %}
{% endfor %}`,
  css: `/* Synapse Generated Styles */
:root {
  --color-primary: oklch(0.156 0 0);
  --color-accent: oklch(0.685 0.169 237);
  --font-heading: 'Geist Sans', sans-serif;
  --font-body: 'Geist Sans', sans-serif;
}

.hero-banner {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--color-primary);
}

.hero-banner__heading {
  font-size: clamp(2.5rem, 6vw, 5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: white;
}

.product-card {
  border-radius: 1rem;
  overflow: hidden;
  transition: transform 0.3s ease;
}

.product-card:hover {
  transform: translateY(-4px);
}`,
  javascript: `// Synapse AI Agent Output
async function optimizeTheme(themeId) {
  const analysis = await analyzePerformance(themeId);
  const issues = analysis.filter(i => i.score < 90);

  for (const issue of issues) {
    const fix = await generateFix(issue);
    await applyFix(themeId, fix);
    console.log(\`Fixed: \${issue.description}\`);
  }

  return { optimized: true, score: 98 };
}

export const agents = {
  code: new CodeAgent({ model: 'claude-opus' }),
  design: new DesignAgent({ model: 'claude-opus' }),
  qa: new QAAgent({ model: 'claude-sonnet' }),
};`,
};

interface CodeTextureProps {
  language?: keyof typeof CODE_SNIPPETS;
  opacity?: number;
  speed?: number;
  className?: string;
}

export function CodeTexture({
  language = 'liquid',
  opacity = 0.03,
  speed = 40,
  className = '',
}: CodeTextureProps) {
  const code = useMemo(() => {
    const snippet = CODE_SNIPPETS[language] || CODE_SNIPPETS.liquid;
    // Repeat enough to fill the scroll
    return (snippet + '\n\n').repeat(4);
  }, [language]);

  const duration = speed; // seconds for one full scroll cycle

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none select-none ${className}`}
      aria-hidden="true"
      style={{ opacity }}
    >
      <div
        className="font-mono text-[9px] leading-[13px] text-stone-500 dark:text-stone-400 whitespace-pre"
        style={{
          animation: `code-scroll-up ${duration}s linear infinite`,
        }}
      >
        {code}
        {code}
      </div>
    </div>
  );
}

