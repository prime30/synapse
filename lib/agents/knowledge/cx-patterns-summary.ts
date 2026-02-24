/**
 * Knowledge module: CX optimization summary referencing the 55 patterns in cx-patterns.ts.
 * Injected when the user asks about conversion, trust, urgency, or CX improvements.
 */

export const CX_PATTERNS_SUMMARY = `## CX Optimization Patterns (55 patterns available)

Synapse has a library of 55 CX patterns across 10 categories. When a user asks for conversion improvements, reference the full library via the CX Pattern tool.

**Categories and high-impact patterns:**
- **Trust (7)**: Trust badges, secure checkout icon, payment method icons, reviews badge — build buyer confidence near add-to-cart
- **Urgency (5)**: Low stock counter, countdown timer, limited-time offer banner — create purchase motivation
- **Social Proof (6)**: Customer reviews, bestseller badge, review count, customer photos — validate buying decisions
- **Navigation (6)**: Predictive search, mega menu, breadcrumbs, sticky header — reduce friction finding products
- **Product (7)**: Sticky add-to-cart, variant swatches, zoom on hover, bundle offers, compare-at price — improve PDP conversion
- **Cart (5)**: Cart drawer, free shipping bar, upsell recommendations, express checkout — increase AOV and reduce abandonment
- **Checkout (5)**: Checkout trust badges, guest checkout, discount code field, shipping estimate — reduce checkout friction
- **Mobile (5)**: Thumb-friendly CTAs, swipeable galleries, mobile sticky add-to-cart — optimize mobile conversion
- **Search (4)**: Predictive search, filter counts, sort options — help shoppers find products faster
- **Personalization (5)**: Recently viewed, wishlist, back-in-stock alerts, recommendations — increase return visits and engagement

Each pattern includes detection rules, related theme files, and a ready-to-use prompt template for implementation.`;

export const CX_PATTERNS_SUMMARY_KEYWORDS = [
  'cx', 'conversion', 'trust', 'urgency', 'social proof', 'mobile', 'cart',
  'checkout', 'seo', 'optimize', 'improve', 'increase', 'aov', 'revenue',
  'abandon', 'bounce', 'engagement',
];

export const CX_PATTERNS_SUMMARY_TOKENS = 450;
