/**
 * FAQ content for the in-app support panel.
 *
 * Pure data — no dependencies. Edit this file to add, remove, or reorder
 * FAQ entries. Categories are rendered as collapsible groups in the
 * FAQAccordion component.
 *
 * @module lib/support/faq-data
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQCategory {
  id: string;
  label: string;
  items: FAQItem[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    items: [
      {
        id: 'gs-create-project',
        question: 'How do I create a new project?',
        answer:
          'Sign in to Synapse and you\'ll land on the dashboard. If you haven\'t connected a store yet, you\'ll be prompted to enter your Shopify store domain and Admin API token. Once connected, click "Import Theme" to pull a theme from your store — this automatically creates a project.',
      },
      {
        id: 'gs-connect-store',
        question: 'How do I connect my Shopify store?',
        answer:
          'Go to the dashboard and enter your store domain (e.g. my-store.myshopify.com) along with your Admin API access token. You can generate a token in your Shopify Admin under Settings > Apps and sales channels > Develop apps > Create app > Configure Admin API scopes. Enable "read_themes" and "write_themes" scopes.',
      },
      {
        id: 'gs-api-token',
        question: 'How do I generate a Shopify Admin API token?',
        answer:
          'In your Shopify Admin, go to Settings > Apps and sales channels > Develop apps. Click "Create an app", give it a name (e.g. "Synapse"), then click "Configure Admin API scopes". Enable at minimum read_themes and write_themes. Click "Install app" and copy the Admin API access token that appears.',
      },
      {
        id: 'gs-import-theme',
        question: 'How do I import a theme?',
        answer:
          'After connecting your store, click "Import Theme" on the dashboard. Select the theme you want to edit from the list (Live, unpublished, or development). We recommend leaving "Create development theme for preview" enabled — this creates a safe copy so your live store is never affected during editing.',
      },
    ],
  },
  {
    id: 'shopify',
    label: 'Shopify Integration',
    items: [
      {
        id: 'sh-preview-not-working',
        question: 'My preview is not loading. What should I do?',
        answer:
          'First, check that your Shopify store is connected (green dot in the Shopify panel). If the connection is active, try clicking the refresh button in the preview panel. If the preview still fails, try re-importing the theme with "Create development theme for preview" enabled. The preview requires a development theme on your store to render.',
      },
      {
        id: 'sh-push-changes',
        question: 'How do I push changes to Shopify?',
        answer:
          'Changes push automatically when you save a file. You can also click "Push to Shopify" in the Shopify panel for a manual push with an optional note. All pushes go to your development theme, not your live store.',
      },
      {
        id: 'sh-rollback',
        question: 'How do I rollback to a previous version?',
        answer:
          'Open the Shopify panel and scroll to "Push History". Find the push you want to restore and click "Rollback to this". Confirm the rollback — your development preview theme will be restored to that point. Your live store is never affected.',
      },
      {
        id: 'sh-dev-vs-live',
        question: 'Will editing in Synapse affect my live store?',
        answer:
          'No. Synapse works exclusively with a development theme on your store. Your live (published) theme is never modified during editing, previewing, or pushing changes. To publish changes to your live store, use the deploy workflow which includes a pre-flight safety check.',
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI Features',
    items: [
      {
        id: 'ai-chat',
        question: 'How do I use the AI assistant?',
        answer:
          'Click the sparkle icon in the activity bar or press Ctrl+L to open the AI sidebar. Type your request in natural language — for example, "Add a hero section with a background video" or "Fix the accessibility issues in this file". The AI understands Shopify Liquid, CSS, and JavaScript.',
      },
      {
        id: 'ai-models',
        question: 'How do I change the AI model?',
        answer:
          'In the AI sidebar input bar, click the model selector dropdown to choose between available models (Claude, Gemini, GPT). Different models have different strengths — Claude excels at code generation, Gemini is great for multi-modal tasks (like analyzing images), and GPT is a solid all-rounder.',
      },
      {
        id: 'ai-modes',
        question: 'What is the difference between Orchestrated and Solo mode?',
        answer:
          'Orchestrated mode uses multiple specialist agents (Liquid, CSS, JS) coordinated by a Project Manager, with a Review agent validating all changes. It\'s best for complex, multi-file tasks. Solo mode uses a single agent for everything — faster for simple requests like "change this color" or "add a heading".',
      },
      {
        id: 'ai-ambient',
        question: 'What are the ambient nudges?',
        answer:
          'Ambient intelligence proactively scans your work and shows suggestions in a bar below the chat — for example, "This section has no schema — generate one?" or "3 images missing alt — fix?". Click the action button to resolve instantly, or dismiss with X. Dismissed suggestions are dampened so they appear less often.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & Billing',
    items: [
      {
        id: 'acc-password',
        question: 'How do I change my password?',
        answer:
          'Click your avatar in the top-right corner and select "Edit profile". From there you can update your display name and avatar. To change your password, use the "Forgot password" flow on the sign-in page — we\'ll send a reset link to your email.',
      },
      {
        id: 'acc-profile',
        question: 'How do I edit my profile?',
        answer:
          'Click your avatar in the top-right corner of the IDE and select "Edit profile". You can update your display name and avatar URL. Changes are saved immediately.',
      },
      {
        id: 'acc-billing',
        question: 'How does billing work?',
        answer:
          'Synapse is currently in early access. Billing details will be shared when we launch paid plans. If you have questions about your account status, reach out to us at support@synapse.shop.',
      },
      {
        id: 'acc-delete',
        question: 'How do I delete my account?',
        answer:
          'To delete your account and all associated data, please contact us at support@synapse.shop. We\'ll process your request within 48 hours. Note that this action is irreversible — all projects, files, and settings will be permanently removed.',
      },
    ],
  },
];

/**
 * Flat list of all FAQ items (useful for search).
 */
export function getAllFAQItems(): (FAQItem & { category: string })[] {
  return FAQ_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({ ...item, category: cat.label })),
  );
}
