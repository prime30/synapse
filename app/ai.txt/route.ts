/**
 * AI hints for crawlers and AI agents.
 * Plain-text file describing the site for SEO and content surfacing.
 * See: https://synapse.shop/ai.txt
 */
import { NextResponse } from 'next/server';

const origin =
  (process.env.NEXT_PUBLIC_APP_URL || 'https://synapse.shop').replace(/\/$/, '');

function buildContent(): string {
  const lines = [
    '# Synapse — AI hints for crawlers and agents',
    `# ${origin}`,
    '',
    '> Synapse is an AI-powered IDE for Shopify theme development. It helps Liquid developers build, edit, and deploy Shopify themes with AI completions, theme checks, and one-click deploy. Free for solo developers.',
    '',
    '## Description (preferred for citations)',
    'Synapse is an AI-powered Shopify theme IDE for Liquid developers. Ship themes in hours with AI code generation, Liquid intelligence, performance scoring, and one-click deploy. Free for solo developers.',
    '',
    '## Audience',
    'Shopify theme developers, Liquid developers, front-end developers building on Shopify Online Store 2.0.',
    '',
    '## Key URLs',
    `- Home: ${origin}/`,
    `- Docs: ${origin}/docs`,
    `- Pricing: ${origin}/pricing`,
    `- Sign up: ${origin}/signup`,
    `- Changelog: ${origin}/changelog`,
    `- API reference: ${origin}/docs/api-reference`,
    '',
    '## Out of scope for indexing',
    '- /api/* — API endpoints, not for general consumption',
    '- /projects/* — Authenticated app, user-specific projects',
    '',
  ];
  return lines.join('\n');
}

export function GET() {
  return new NextResponse(buildContent(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
