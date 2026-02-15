export interface Announcement {
  id: string;
  title: string;
  body: string;
  link?: string;
  dismissible: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'launch-v1',
    title: 'New: AI-Powered Theme Editing',
    body: 'Use natural language to edit your Shopify theme with AI agents.',
    link: '/docs',
    dismissible: true,
  },
];
