export type PolicyType = 'return' | 'privacy' | 'terms' | 'shipping' | 'contact';

export interface PolicyContent {
  type: PolicyType;
  title: string;
  html: string;
  source: 'template' | 'ai';
  generatedAt: string;
}

export interface ThemeStyles {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bodyFont: string;
  headingFont: string;
  backgroundColor: string;
  textColor: string;
}

export const POLICY_LABELS: Record<PolicyType, string> = {
  return: 'Return & Refund Policy',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  shipping: 'Shipping Policy',
  contact: 'Contact Information',
};

export const POLICY_DESCRIPTIONS: Record<PolicyType, string> = {
  return: 'Return windows, hygiene requirements, exchanges, and refund process.',
  privacy: 'Data collection, cookies, third-party services, and user rights.',
  terms: 'Product terms, liability limits, intellectual property, and governing law.',
  shipping: 'Processing times, shipping methods, international, and tracking.',
  contact: 'Email, hours, social media, and support information.',
};
