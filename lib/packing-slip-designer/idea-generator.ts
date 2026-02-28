export interface ImportIdea {
  id: string;
  name: string;
  description: string;
  liquid: string;
}

function ensureStyleBlock(template: string): string {
  if (/<style[\s>]/i.test(template)) return template;
  const style = `<style>
body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 6px 8px; vertical-align: top; }
</style>\n`;
  return `${style}${template}`;
}

function injectStyleOverrides(template: string, overrides: string): string {
  const withStyle = ensureStyleBlock(template);
  if (/<\/style>/i.test(withStyle)) {
    return withStyle.replace(/<\/style>/i, `\n${overrides}\n</style>`);
  }
  return `${withStyle}\n<style>\n${overrides}\n</style>`;
}

export function generateImportIdeas(sourceTemplate: string): ImportIdea[] {
  const base = sourceTemplate.trim();
  if (!base) return [];

  const ideas: Array<{ name: string; description: string; overrides: string }> = [
    {
      name: 'Original Cleaned',
      description: 'Keeps your current structure with safer print defaults.',
      overrides: `
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
img { max-width: 100%; height: auto; }`,
    },
    {
      name: 'Minimal Mono',
      description: 'Stripped-down monochrome print style with strong readability.',
      overrides: `
body { color: #111; font-size: 12px; line-height: 1.45; }
h1,h2,h3,strong { color: #000; }
table, th, td { border-color: #000 !important; }
* { box-shadow: none !important; text-shadow: none !important; }`,
    },
    {
      name: 'Compact Thermal',
      description: 'Tighter spacing for dense packing operations.',
      overrides: `
body { font-size: 11px; line-height: 1.25; }
table { font-size: 11px; }
th, td { padding: 3px 4px !important; }
h1,h2,h3 { margin: 0 0 6px 0; }
p { margin: 0 0 4px 0; }`,
    },
    {
      name: 'Branded Header',
      description: 'Adds stronger visual hierarchy for brand-forward slips.',
      overrides: `
body { font-size: 12px; }
h1,h2 { letter-spacing: 0.02em; text-transform: uppercase; }
table thead th { border-bottom: 2px solid #111; }
hr { border: 0; border-top: 1px solid #111; }`,
    },
    {
      name: 'Warehouse Focus',
      description: 'Highlights SKUs, quantities, and picker-friendly scanning.',
      overrides: `
td, th { font-size: 11px; }
strong, .sku, [class*="sku"] { font-weight: 700 !important; letter-spacing: 0.02em; }
table thead th { background: #f4f4f4; }
tr { page-break-inside: avoid; }`,
    },
    {
      name: 'Customer Friendly',
      description: 'Softer spacing and cleaner typography for premium unboxing.',
      overrides: `
body { font-size: 12px; line-height: 1.5; color: #222; }
h1,h2,h3 { margin-bottom: 8px; }
table thead th { border-bottom: 1px solid #ddd; color: #333; }
table tbody td { border-bottom: 1px solid #eee; }`,
    },
  ];

  return ideas.map((idea, idx) => ({
    id: `idea-${idx + 1}`,
    name: idea.name,
    description: idea.description,
    liquid: injectStyleOverrides(base, idea.overrides),
  }));
}
