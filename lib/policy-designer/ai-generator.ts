import type { PolicyType } from './types';
import { POLICY_LABELS } from './types';
import { getAIProvider } from '@/lib/ai/get-provider';

interface GenerationContext {
  storeName: string;
  email?: string;
  industry?: string;
  specialNotes?: string;
}

const POLICY_SECTION_HINTS: Record<PolicyType, string> = {
  return: 'Return eligibility, return window, condition requirements, how to initiate a return, refund method, refund timeline, exchanges, non-returnable items, and shipping costs.',
  privacy: 'Information collected, how data is used, third-party services (Shopify, payment processors, shipping carriers), cookies, data retention, user rights (access/correct/delete), children\'s privacy, and contact info.',
  terms: 'Acceptance of terms, product descriptions and accuracy, pricing, age requirement, intellectual property, limitation of liability, indemnification, governing law, and dispute resolution.',
  shipping: 'Processing time, shipping methods and estimated delivery, free shipping thresholds, international shipping and customs, order tracking, lost or damaged packages, and shipping restrictions.',
  contact: 'Email address, business hours, response time commitment, social media links, support categories (orders, returns, general), and physical address if applicable.',
};

function buildSystemPrompt(): string {
  return [
    'You are a legal policy copywriter for Shopify stores.',
    'Generate a store policy page as clean HTML with inline styles.',
    '',
    'Rules:',
    '- Use <h2> tags for section headings (never <h1>).',
    '- Use inline styles only — no <style> blocks, no CSS classes.',
    '- Style headings: font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;',
    '- Style paragraphs: margin-bottom: 12px; line-height: 1.6; color: #444;',
    '- Style links: color: #0066cc; text-decoration: underline;',
    '- Style lists: margin-bottom: 16px; padding-left: 24px; color: #444;',
    '- Style list items: margin-bottom: 6px; line-height: 1.5;',
    '- Add a footer with last-updated date and contact email, separated by a top border.',
    '- Use <strong> for emphasis on key terms.',
    '- Write in a professional but approachable tone.',
    '- Output ONLY the HTML — no markdown fences, no explanation, no commentary.',
    '',
    'DISCLAIMER: Include a small note that this is not legal advice.',
  ].join('\n');
}

function buildUserPrompt(type: PolicyType, context: GenerationContext): string {
  const parts = [
    `Generate a "${POLICY_LABELS[type]}" for the following store:`,
    '',
    `Store name: ${context.storeName}`,
  ];

  if (context.email) parts.push(`Contact email: ${context.email}`);
  if (context.industry) parts.push(`Industry: ${context.industry}`);
  if (context.specialNotes) parts.push(`Special notes: ${context.specialNotes}`);

  parts.push('');
  parts.push(`Include these sections: ${POLICY_SECTION_HINTS[type]}`);
  parts.push('');
  parts.push(`Today's date for the "Last updated" footer: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);

  if (context.email) {
    parts.push(`Use mailto links for the contact email: ${context.email}`);
  }

  return parts.join('\n');
}

export async function generatePolicy(
  type: PolicyType,
  context: GenerationContext,
): Promise<string> {
  const provider = getAIProvider('anthropic');

  const result = await provider.complete(
    [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(type, context) },
    ],
    {
      model: 'claude-haiku-4-5',
      temperature: 0.4,
      maxTokens: 4096,
    },
  );

  return cleanHTML(result.content);
}

/**
 * Strip any markdown fences or leading/trailing whitespace the model may produce.
 */
function cleanHTML(raw: string): string {
  let html = raw.trim();
  if (html.startsWith('```html')) html = html.slice(7);
  else if (html.startsWith('```')) html = html.slice(3);
  if (html.endsWith('```')) html = html.slice(0, -3);
  return html.trim();
}
