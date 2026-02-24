import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';

const blueprintSchema = z.object({
  projectId: z.string().uuid().optional(),
  prompt: z.string().min(4),
  mode: z.enum(['liquid', 'headless', 'hybrid']).optional().default('liquid'),
  audience: z.enum(['merchant', 'stakeholder', 'developer']).optional().default('stakeholder'),
});

type BlueprintSection = {
  section: string;
  purpose: string;
  presets: string[];
  settings: Array<{
    id: string;
    type: 'text' | 'textarea' | 'checkbox' | 'select' | 'range' | 'color' | 'image_picker' | 'url';
    label: string;
    default?: string | number | boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
};

function inferTags(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const tags: string[] = [];
  if (/\bfashion|apparel|clothing\b/.test(p)) tags.push('fashion');
  if (/\bhome|furniture|decor\b/.test(p)) tags.push('home');
  if (/\bbeauty|cosmetic|skin\b/.test(p)) tags.push('beauty');
  if (/\bfood|drink|coffee|supplement\b/.test(p)) tags.push('consumables');
  if (/\bb2b|wholesale\b/.test(p)) tags.push('b2b');
  if (/\bsubscription\b/.test(p)) tags.push('subscription');
  if (/\bminimal|clean\b/.test(p)) tags.push('minimal');
  if (/\bluxury|premium\b/.test(p)) tags.push('premium');
  if (/\bfast|performance\b/.test(p)) tags.push('performance');
  return tags;
}

function buildSections(tags: string[]): BlueprintSection[] {
  const heroStyleDefault = tags.includes('premium') ? 'editorial' : 'split';
  const denseCatalog = tags.includes('b2b') || tags.includes('consumables');

  return [
    {
      section: 'hero-banner',
      purpose: 'Primary value proposition and call-to-action',
      presets: ['Home Hero', 'Collection Hero'],
      settings: [
        { id: 'eyebrow', type: 'text', label: 'Eyebrow', default: 'New season' },
        { id: 'heading', type: 'text', label: 'Heading', default: 'Make your launch shine' },
        { id: 'subheading', type: 'textarea', label: 'Subheading', default: 'Configurable hero designed for conversion.' },
        { id: 'cta_label', type: 'text', label: 'Primary CTA Label', default: 'Shop now' },
        { id: 'cta_url', type: 'url', label: 'Primary CTA URL' },
        { id: 'layout', type: 'select', label: 'Hero Layout', default: heroStyleDefault, options: [
          { value: 'split', label: 'Split' },
          { value: 'centered', label: 'Centered' },
          { value: 'editorial', label: 'Editorial' },
        ] },
        { id: 'background_image', type: 'image_picker', label: 'Background image' },
      ],
    },
    {
      section: 'featured-collection-grid',
      purpose: 'Merchandising products with customizable density and card style',
      presets: ['Featured Collection', 'Best Sellers'],
      settings: [
        { id: 'heading', type: 'text', label: 'Heading', default: 'Featured products' },
        { id: 'products_per_row_desktop', type: 'range', label: 'Desktop columns', default: denseCatalog ? 4 : 3 },
        { id: 'products_per_row_mobile', type: 'range', label: 'Mobile columns', default: 2 },
        { id: 'show_quick_add', type: 'checkbox', label: 'Show quick add', default: true },
        { id: 'show_secondary_image', type: 'checkbox', label: 'Show secondary image', default: !denseCatalog },
      ],
    },
    {
      section: 'product-main',
      purpose: 'Core PDP layout with variant and trust modules',
      presets: ['Default product'],
      settings: [
        { id: 'media_layout', type: 'select', label: 'Media layout', default: 'stacked', options: [
          { value: 'stacked', label: 'Stacked' },
          { value: 'carousel', label: 'Carousel' },
          { value: 'grid', label: 'Grid' },
        ] },
        { id: 'show_size_guide', type: 'checkbox', label: 'Show size guide', default: tags.includes('fashion') },
        { id: 'show_inventory_notice', type: 'checkbox', label: 'Show inventory notice', default: true },
        { id: 'sticky_add_to_cart', type: 'checkbox', label: 'Sticky add to cart', default: true },
      ],
    },
    {
      section: 'trust-icons',
      purpose: 'Stakeholder-friendly trust proof module',
      presets: ['Shipping + returns'],
      settings: [
        { id: 'heading', type: 'text', label: 'Heading', default: 'Why customers trust us' },
        { id: 'icon_style', type: 'select', label: 'Icon style', default: 'outline', options: [
          { value: 'outline', label: 'Outline' },
          { value: 'filled', label: 'Filled' },
        ] },
        { id: 'background_color', type: 'color', label: 'Background', default: 'oklch(0.977 0 0)' },
      ],
    },
  ];
}

function buildMarkdown(prompt: string, mode: 'liquid' | 'headless' | 'hybrid', audience: 'merchant' | 'stakeholder' | 'developer', tags: string[], sections: BlueprintSection[]): string {
  const architecture = mode === 'liquid'
    ? ['layout/theme.liquid', 'templates/*.json', 'sections/*.liquid', 'snippets/*.liquid', 'assets/*', 'config/*', 'locales/*']
    : mode === 'headless'
      ? ['apps/storefront (Next/Hydrogen)', 'shopify data layer', 'cms/theme settings bridge', 'component schema contracts']
      : ['shopify liquid shell', 'headless storefront layer', 'shared schema contracts'];

  const stakeholderGuidance = audience === 'stakeholder'
    ? [
        'Use plain-language setting labels (avoid developer terms).',
        'Expose merchandising controls first (content, CTAs, layout).',
        'Set safe defaults so Customizer changes are low-risk.',
      ]
    : [
        'Expose only high-impact controls by default.',
        'Keep schema contracts stable across section versions.',
      ];

  const sectionTable = sections
    .map((s) => `| ${s.section} | ${s.purpose} | ${s.settings.length} |`)
    .join('\n');

  return [
    '## Theme Blueprint (Schema-first)',
    '',
    `Prompt: ${prompt}`,
    `Mode: ${mode}`,
    `Audience: ${audience}`,
    `Tags: ${tags.length > 0 ? tags.join(', ') : 'general commerce'}`,
    '',
    '### Architecture',
    ...architecture.map((a) => `- ${a}`),
    '',
    '### Customizer Experience Principles',
    ...stakeholderGuidance.map((g) => `- ${g}`),
    '- Group settings into "Content", "Layout", "Behavior", "Styling".',
    '- Keep block schemas short and composable for non-coders.',
    '',
    '### Section Plan',
    '| Section | Purpose | Settings |',
    '|---|---|---|',
    sectionTable,
    '',
    '### Implementation Sequence',
    '- Build base section schemas and presets.',
    '- Connect snippets/assets contracts (render + selectors).',
    '- Add locales and merchant-friendly labels/help text.',
    '- Validate in Theme Check + preview matrix (mobile/desktop + product/cart states).',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = blueprintSchema.parse(await request.json());
    const tags = inferTags(body.prompt);
    const sections = buildSections(tags);
    const markdown = buildMarkdown(body.prompt, body.mode, body.audience, tags, sections);

    return NextResponse.json({
      ok: true,
      blueprint: {
        mode: body.mode,
        audience: body.audience,
        tags,
        sections,
        markdown,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blueprint generation failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

