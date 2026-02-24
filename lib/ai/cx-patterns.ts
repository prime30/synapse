/**
 * CX Pattern Library – structured knowledge base of 50+ Shopify CX patterns.
 * Used by the Theme Gap Detector and Next Steps Generator for EPIC U7.
 */

export interface CXPattern {
  id: string;
  category:
    | 'trust'
    | 'urgency'
    | 'social-proof'
    | 'navigation'
    | 'product'
    | 'cart'
    | 'checkout'
    | 'mobile'
    | 'search'
    | 'personalization';
  name: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  relatedFiles: string[];
  relatedSections: string[];
  detectionPattern: string;
  promptTemplate: string;
}

export const CX_PATTERNS: CXPattern[] = [
  // ── TRUST (7 patterns) ────────────────────────────────────────────────────
  {
    id: 'trust-badges',
    category: 'trust',
    name: 'Trust badges',
    impact: 'high',
    description:
      'Payment and security badges below add-to-cart build buyer confidence',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-trust-badges.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'trust\\.badge|trust-badge|payment-icons|secure-checkout',
    promptTemplate:
      'Add trust badges (payment icons, secure checkout, money-back guarantee) below the add-to-cart button on the product page',
  },
  {
    id: 'trust-secure-checkout',
    category: 'trust',
    name: 'Secure checkout icon',
    impact: 'high',
    description: 'SSL or lock icon near checkout to signal security',
    relatedFiles: ['sections/main-cart.liquid', 'snippets/cart-drawer.liquid', 'layout/theme.liquid'],
    relatedSections: ['main-cart', 'header'],
    detectionPattern: 'secure|ssl|lock-icon|padlock|https',
    promptTemplate:
      'Add a secure checkout icon (lock or SSL badge) near the checkout button to build buyer confidence',
  },
  {
    id: 'trust-return-policy',
    category: 'trust',
    name: 'Return policy',
    impact: 'medium',
    description: 'Clear return or refund policy link/text reduces purchase anxiety',
    relatedFiles: ['sections/main-product.liquid', 'snippets/footer.liquid', 'sections/footer.liquid'],
    relatedSections: ['main-product', 'footer'],
    detectionPattern: 'return\\s*policy|refund|money-back|free\\s*returns',
    promptTemplate:
      'Add a visible return policy or money-back guarantee link near the add-to-cart area',
  },
  {
    id: 'trust-payment-icons',
    category: 'trust',
    name: 'Payment method icons',
    impact: 'high',
    description: 'Accepted payment methods (Visa, Mastercard, etc.) increase trust',
    relatedFiles: ['sections/main-product.liquid', 'snippets/footer.liquid', 'sections/footer.liquid'],
    relatedSections: ['main-product', 'footer'],
    detectionPattern: 'payment-icons|payment_icons|shopify_payment_types|payment-type',
    promptTemplate:
      'Display accepted payment method icons (Visa, Mastercard, PayPal, etc.) below the add-to-cart button',
  },
  {
    id: 'trust-reviews-badge',
    category: 'trust',
    name: 'Reviews badge',
    impact: 'high',
    description: 'Star rating or review count badge on product cards',
    relatedFiles: ['snippets/product-card.liquid', 'sections/main-product.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'rating|review-badge|reviews_count|shopify-product-reviews',
    promptTemplate:
      'Add a reviews badge (star rating or review count) to product cards and the product page',
  },
  {
    id: 'trust-satisfaction-guarantee',
    category: 'trust',
    name: 'Satisfaction guarantee',
    impact: 'medium',
    description: 'Explicit satisfaction or quality guarantee messaging',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'satisfaction|guarantee|100%\\s*satisfaction',
    promptTemplate:
      'Add a satisfaction guarantee or quality promise near the product form',
  },
  {
    id: 'trust-ssl-badge',
    category: 'trust',
    name: 'SSL badge',
    impact: 'medium',
    description: 'SSL or security badge in footer or checkout area',
    relatedFiles: ['sections/footer.liquid', 'snippets/footer.liquid', 'layout/theme.liquid'],
    relatedSections: ['footer'],
    detectionPattern: 'ssl|secure\\s*badge|security-badge',
    promptTemplate:
      'Add an SSL or security badge in the footer to signal a secure site',
  },

  // ── URGENCY (5 patterns) ──────────────────────────────────────────────────
  {
    id: 'urgency-low-stock',
    category: 'urgency',
    name: 'Low stock counter',
    impact: 'high',
    description: 'Shows remaining quantity to encourage quick purchase',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'inventory_quantity|low-stock|only\\s*\\d+\\s*left|stock-level',
    promptTemplate:
      'Add a low stock counter showing remaining quantity when inventory is below a threshold',
  },
  {
    id: 'urgency-countdown',
    category: 'urgency',
    name: 'Countdown timer',
    impact: 'high',
    description: 'Countdown for sales or limited-time offers',
    relatedFiles: ['sections/main-product.liquid', 'sections/header.liquid', 'snippets/announcement-bar.liquid'],
    relatedSections: ['main-product', 'header'],
    detectionPattern: 'countdown|count-down|timer|time-left|deadline',
    promptTemplate:
      'Add a countdown timer for sale end or limited-time offer',
  },
  {
    id: 'urgency-viewing-now',
    category: 'urgency',
    name: '"X people viewing"',
    impact: 'medium',
    description: 'Real-time or simulated viewer count to create urgency',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-card.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'people\\s*viewing|viewing\\s*now|\\d+\\s*people|currently\\s*viewing',
    promptTemplate:
      'Add "X people viewing this" or similar social proof near the add-to-cart',
  },
  {
    id: 'urgency-limited-offer',
    category: 'urgency',
    name: 'Limited time offer',
    impact: 'high',
    description: 'Banner or badge for limited-time promotions',
    relatedFiles: ['sections/header.liquid', 'snippets/announcement-bar.liquid', 'layout/theme.liquid'],
    relatedSections: ['header'],
    detectionPattern: 'limited\\s*time|limited-time|flash\\s*sale|offer\\s*ends',
    promptTemplate:
      'Add a limited time offer banner or badge for promotions',
  },
  {
    id: 'urgency-sale-ending',
    category: 'urgency',
    name: 'Sale ending soon',
    impact: 'medium',
    description: 'Messaging when sale is about to end',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-card.liquid', 'sections/header.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'sale\\s*ending|ending\\s*soon|last\\s*chance|final\\s*hours',
    promptTemplate:
      'Add "Sale ending soon" or "Last chance" messaging for sale products',
  },

  // ── SOCIAL PROOF (6 patterns) ───────────────────────────────────────────────
  {
    id: 'social-reviews',
    category: 'social-proof',
    name: 'Customer reviews',
    impact: 'high',
    description: 'Full review section on product page',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-reviews.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'product-reviews|reviews-section|shopify-product-reviews|review-form',
    promptTemplate:
      'Add a customer reviews section to the product page',
  },
  {
    id: 'social-bestseller',
    category: 'social-proof',
    name: 'Bestseller badge',
    impact: 'medium',
    description: 'Bestseller or top-seller badge on product cards',
    relatedFiles: ['snippets/product-card.liquid', 'sections/main-collection.liquid'],
    relatedSections: ['main-collection'],
    detectionPattern: 'bestseller|best-seller|top-seller|bestselling',
    promptTemplate:
      'Add a bestseller badge to top-selling product cards',
  },
  {
    id: 'social-recently-purchased',
    category: 'social-proof',
    name: 'Recently purchased',
    impact: 'medium',
    description: 'Shows recent purchases from other customers',
    relatedFiles: ['sections/main-product.liquid', 'snippets/recent-purchases.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'recently\\s*purchased|recent-purchase|just\\s*bought',
    promptTemplate:
      'Add a "Recently purchased" or "Just bought" social proof element',
  },
  {
    id: 'social-instagram',
    category: 'social-proof',
    name: 'Instagram feed',
    impact: 'medium',
    description: 'Instagram feed or UGC gallery on homepage or product page',
    relatedFiles: ['sections/instagram-feed.liquid', 'sections/main-product.liquid', 'snippets/instagram.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'instagram|insta-feed|ugc-gallery|user-generated',
    promptTemplate:
      'Add an Instagram feed or UGC gallery section',
  },
  {
    id: 'social-customer-photos',
    category: 'social-proof',
    name: 'Customer photos',
    impact: 'medium',
    description: 'Customer-submitted photos in reviews or gallery',
    relatedFiles: ['snippets/product-reviews.liquid', 'sections/main-product.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'customer-photo|customer_photo|review-image|photo-review',
    promptTemplate:
      'Add customer photo display in reviews or product gallery',
  },
  {
    id: 'social-review-count',
    category: 'social-proof',
    name: 'Review count',
    impact: 'high',
    description: 'Displays number of reviews (e.g. "127 reviews")',
    relatedFiles: ['snippets/product-card.liquid', 'sections/main-product.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'reviews_count|review-count|\\d+\\s*reviews',
    promptTemplate:
      'Display the review count (e.g. "127 reviews") on product cards and product page',
  },

  // ── NAVIGATION (6 patterns) ─────────────────────────────────────────────────
  {
    id: 'nav-predictive-search',
    category: 'navigation',
    name: 'Predictive search',
    impact: 'high',
    description: 'Search suggestions as user types',
    relatedFiles: ['sections/header.liquid', 'snippets/predictive-search.liquid', 'assets/predictive-search.js'],
    relatedSections: ['header'],
    detectionPattern: 'predictive-search|predictive_search|search-suggestions',
    promptTemplate:
      'Add predictive search with suggestions as the user types',
  },
  {
    id: 'nav-mega-menu',
    category: 'navigation',
    name: 'Mega menu',
    impact: 'medium',
    description: 'Dropdown with multiple columns and images',
    relatedFiles: ['sections/header.liquid', 'snippets/mega-menu.liquid', 'snippets/menu-drawer.liquid'],
    relatedSections: ['header'],
    detectionPattern: 'mega-menu|mega_menu|megamenu',
    promptTemplate:
      'Add a mega menu with columns and optional images for main navigation',
  },
  {
    id: 'nav-breadcrumbs',
    category: 'navigation',
    name: 'Breadcrumbs',
    impact: 'medium',
    description: 'Breadcrumb trail for product and collection pages',
    relatedFiles: ['sections/main-product.liquid', 'sections/main-collection.liquid', 'snippets/breadcrumbs.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'breadcrumb|bread-crumb',
    promptTemplate:
      'Add breadcrumb navigation to product and collection pages',
  },
  {
    id: 'nav-sticky-header',
    category: 'navigation',
    name: 'Sticky header',
    impact: 'medium',
    description: 'Header stays visible on scroll',
    relatedFiles: ['sections/header.liquid', 'layout/theme.liquid', 'assets/header.js'],
    relatedSections: ['header'],
    detectionPattern: 'sticky|position:\\s*fixed|header-sticky',
    promptTemplate:
      'Make the header sticky so it stays visible when scrolling',
  },
  {
    id: 'nav-back-to-top',
    category: 'navigation',
    name: 'Back to top',
    impact: 'low',
    description: 'Button to scroll back to top of page',
    relatedFiles: ['layout/theme.liquid', 'snippets/footer.liquid', 'assets/theme.js'],
    relatedSections: ['footer'],
    detectionPattern: 'back-to-top|back_to_top|scroll-to-top',
    promptTemplate:
      'Add a back-to-top button that appears when user scrolls down',
  },
  {
    id: 'nav-mobile-hamburger',
    category: 'navigation',
    name: 'Mobile hamburger menu',
    impact: 'high',
    description: 'Hamburger icon and drawer for mobile navigation',
    relatedFiles: ['sections/header.liquid', 'snippets/menu-drawer.liquid', 'snippets/mobile-menu.liquid'],
    relatedSections: ['header'],
    detectionPattern: 'hamburger|menu-drawer|mobile-menu|menu-toggle',
    promptTemplate:
      'Add a mobile hamburger menu with drawer navigation',
  },

  // ── PRODUCT (7 patterns) ────────────────────────────────────────────────────
  {
    id: 'product-sticky-atc',
    category: 'product',
    name: 'Sticky add-to-cart',
    impact: 'high',
    description: 'Add-to-cart bar sticks on scroll for long product pages',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'sticky.*add-to-cart|sticky-atc|product-form-sticky',
    promptTemplate:
      'Add a sticky add-to-cart bar that appears when scrolling past the product form',
  },
  {
    id: 'product-size-guide',
    category: 'product',
    name: 'Size guide',
    impact: 'medium',
    description: 'Link or modal with size chart',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid', 'snippets/size-guide.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'size-guide|size_guide|size-chart',
    promptTemplate:
      'Add a size guide link or modal with size chart for apparel',
  },
  {
    id: 'product-variant-swatches',
    category: 'product',
    name: 'Variant swatches',
    impact: 'high',
    description: 'Color/size swatches instead of dropdowns',
    relatedFiles: ['snippets/product-form.liquid', 'snippets/variant-picker.liquid', 'sections/main-product.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'variant-picker|color-swatch|size-swatch|variant-swatch',
    promptTemplate:
      'Add variant swatches (color, size) instead of dropdown selects',
  },
  {
    id: 'product-zoom-hover',
    category: 'product',
    name: 'Zoom on hover',
    impact: 'medium',
    description: 'Image zoom on hover for product gallery',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-gallery.liquid', 'assets/product-gallery.js'],
    relatedSections: ['main-product'],
    detectionPattern: 'zoom|image-zoom|hover-zoom|magnify',
    promptTemplate:
      'Add image zoom on hover for the product gallery',
  },
  {
    id: 'product-video',
    category: 'product',
    name: 'Product video',
    impact: 'high',
    description: 'Video in product gallery or media',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-gallery.liquid', 'snippets/media.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'product-video|media.*video|video.*product',
    promptTemplate:
      'Add product video support in the product media gallery',
  },
  {
    id: 'product-bundle',
    category: 'product',
    name: 'Bundle offers',
    impact: 'high',
    description: 'Frequently bought together or bundle discounts',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-recommendations.liquid', 'snippets/bundle.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'bundle|frequently-bought|product-recommendations',
    promptTemplate:
      'Add bundle offers or "Frequently bought together" section',
  },
  {
    id: 'product-compare-at',
    category: 'product',
    name: 'Compare at price',
    impact: 'high',
    description: 'Shows original price crossed out when on sale',
    relatedFiles: ['snippets/product-card.liquid', 'sections/main-product.liquid', 'snippets/price.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'compare_at_price|compare-at-price|product-card-price',
    promptTemplate:
      'Display compare-at price (original price crossed out) for sale products',
  },

  // ── CART (5 patterns) ──────────────────────────────────────────────────────
  {
    id: 'cart-drawer',
    category: 'cart',
    name: 'Cart drawer',
    impact: 'high',
    description: 'Slide-out cart instead of full page',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid', 'sections/header.liquid'],
    relatedSections: ['header', 'main-cart'],
    detectionPattern: 'cart-drawer|cart_drawer|drawer.*cart',
    promptTemplate:
      'Add a cart drawer that slides out from the side instead of navigating to cart page',
  },
  {
    id: 'cart-free-shipping',
    category: 'cart',
    name: 'Free shipping bar',
    impact: 'high',
    description: 'Progress bar showing amount left for free shipping',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid', 'sections/header.liquid'],
    relatedSections: ['main-cart', 'header'],
    detectionPattern: 'free-shipping|free_shipping|shipping-threshold|progress.*shipping',
    promptTemplate:
      'Add a free shipping progress bar showing amount left to qualify',
  },
  {
    id: 'cart-upsell',
    category: 'cart',
    name: 'Upsell recommendations',
    impact: 'medium',
    description: 'Related products in cart to increase AOV',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid', 'snippets/cart-recommendations.liquid'],
    relatedSections: ['main-cart'],
    detectionPattern: 'cart-recommendations|upsell|cross-sell|related.*cart',
    promptTemplate:
      'Add upsell or cross-sell product recommendations in the cart',
  },
  {
    id: 'cart-express-checkout',
    category: 'cart',
    name: 'Express checkout',
    impact: 'high',
    description: 'Shop Pay, Apple Pay, Google Pay buttons',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid', 'snippets/dynamic-checkout.liquid'],
    relatedSections: ['main-cart'],
    detectionPattern: 'dynamic-checkout|shopify-payment-terms|shop_pay|apple_pay|google_pay',
    promptTemplate:
      'Add express checkout buttons (Shop Pay, Apple Pay, Google Pay)',
  },
  {
    id: 'cart-saved-items',
    category: 'cart',
    name: 'Saved items',
    impact: 'medium',
    description: 'Wishlist or save-for-later in cart',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid'],
    relatedSections: ['main-cart'],
    detectionPattern: 'saved-items|save-for-later|wishlist.*cart',
    promptTemplate:
      'Add saved items or save-for-later in the cart',
  },

  // ── CHECKOUT (5 patterns) ───────────────────────────────────────────────────
  {
    id: 'checkout-trust-badges',
    category: 'checkout',
    name: 'Checkout trust badges',
    impact: 'high',
    description: 'Trust elements on checkout page',
    relatedFiles: ['layout/theme.liquid', 'sections/header.liquid'],
    relatedSections: ['header'],
    detectionPattern: 'checkout.*trust|trust.*checkout|secure-checkout-badge',
    promptTemplate:
      'Add trust badges visible on or near the checkout flow',
  },
  {
    id: 'checkout-guest',
    category: 'checkout',
    name: 'Guest checkout',
    impact: 'high',
    description: 'Option to checkout without account',
    relatedFiles: ['layout/theme.liquid'],
    relatedSections: [],
    detectionPattern: 'guest|checkout.*guest',
    promptTemplate:
      'Ensure guest checkout is enabled and communicated in the theme',
  },
  {
    id: 'checkout-order-summary',
    category: 'checkout',
    name: 'Order summary sticky',
    impact: 'medium',
    description: 'Sticky order summary on checkout',
    relatedFiles: ['layout/theme.liquid'],
    relatedSections: [],
    detectionPattern: 'order-summary|order_summary',
    promptTemplate:
      'Add a sticky order summary visible during checkout',
  },
  {
    id: 'checkout-discount-code',
    category: 'checkout',
    name: 'Discount code field',
    impact: 'medium',
    description: 'Promo code input in cart/checkout',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid'],
    relatedSections: ['main-cart'],
    detectionPattern: 'discount|promo-code|coupon|cart-note',
    promptTemplate:
      'Add a discount/promo code input field in the cart',
  },
  {
    id: 'checkout-shipping-estimate',
    category: 'checkout',
    name: 'Shipping estimate',
    impact: 'medium',
    description: 'Shipping cost or delivery estimate',
    relatedFiles: ['snippets/cart-drawer.liquid', 'sections/main-cart.liquid'],
    relatedSections: ['main-cart'],
    detectionPattern: 'shipping.*estimate|delivery.*date|shipping-rate',
    promptTemplate:
      'Add shipping cost estimate or delivery date in cart',
  },

  // ── MOBILE (5 patterns) ────────────────────────────────────────────────────
  {
    id: 'mobile-thumb-cta',
    category: 'mobile',
    name: 'Thumb-friendly CTAs',
    impact: 'high',
    description: 'Primary buttons in easy thumb reach',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid', 'assets/theme.css'],
    relatedSections: ['main-product'],
    detectionPattern: 'thumb|mobile-cta|bottom-fixed|fixed.*bottom',
    promptTemplate:
      'Ensure primary CTAs are thumb-friendly on mobile (bottom placement, adequate size)',
  },
  {
    id: 'mobile-swipe-gallery',
    category: 'mobile',
    name: 'Swipeable galleries',
    impact: 'high',
    description: 'Swipe to navigate product images on mobile',
    relatedFiles: ['snippets/product-gallery.liquid', 'sections/main-product.liquid', 'assets/product-gallery.js'],
    relatedSections: ['main-product'],
    detectionPattern: 'swipe|touch-swipe|carousel|slider|flickity|swiper',
    promptTemplate:
      'Add swipeable product image gallery for mobile',
  },
  {
    id: 'mobile-nav',
    category: 'mobile',
    name: 'Mobile nav',
    impact: 'high',
    description: 'Optimized mobile navigation',
    relatedFiles: ['sections/header.liquid', 'snippets/menu-drawer.liquid', 'snippets/mobile-menu.liquid'],
    relatedSections: ['header'],
    detectionPattern: 'mobile-nav|mobile_nav|menu-drawer|@media.*768',
    promptTemplate:
      'Add optimized mobile navigation (drawer or full-screen menu)',
  },
  {
    id: 'mobile-tap-expand',
    category: 'mobile',
    name: 'Tap to expand',
    impact: 'medium',
    description: 'Collapsible sections (e.g. product description)',
    relatedFiles: ['sections/main-product.liquid', 'snippets/collapsible-content.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'collapsible|accordion|tap-to-expand|expandable',
    promptTemplate:
      'Add tap-to-expand collapsible sections for product description on mobile',
  },
  {
    id: 'mobile-sticky-atc',
    category: 'mobile',
    name: 'Mobile sticky add-to-cart',
    impact: 'high',
    description: 'Sticky add-to-cart bar on mobile product page',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'sticky.*mobile|mobile.*sticky|product-form.*fixed',
    promptTemplate:
      'Add a sticky add-to-cart bar on mobile product pages',
  },

  // ── SEARCH (4 patterns) ────────────────────────────────────────────────────
  {
    id: 'search-predictive',
    category: 'search',
    name: 'Predictive search',
    impact: 'high',
    description: 'Search suggestions as user types',
    relatedFiles: ['sections/header.liquid', 'snippets/predictive-search.liquid'],
    relatedSections: ['header'],
    detectionPattern: 'predictive-search|predictive_search|search-suggestions',
    promptTemplate:
      'Add predictive search with live suggestions',
  },
  {
    id: 'search-filter-counts',
    category: 'search',
    name: 'Filter with counts',
    impact: 'medium',
    description: 'Collection filters show product counts per filter',
    relatedFiles: ['sections/main-collection.liquid', 'snippets/facets.liquid', 'snippets/collection-filters.liquid'],
    relatedSections: ['main-collection'],
    detectionPattern: 'facets|filter.*count|product_count|filter-count',
    promptTemplate:
      'Add collection filters with product counts per filter option',
  },
  {
    id: 'search-sort',
    category: 'search',
    name: 'Sort options',
    impact: 'medium',
    description: 'Sort by price, newest, best selling',
    relatedFiles: ['sections/main-collection.liquid', 'snippets/collection-sort.liquid'],
    relatedSections: ['main-collection'],
    detectionPattern: 'sort_by|sort-by|collection-sort',
    promptTemplate:
      'Add sort options (price, newest, best selling) to collection pages',
  },
  {
    id: 'search-you-may-like',
    category: 'search',
    name: '"You may also like"',
    impact: 'medium',
    description: 'Recommendations when search has no/few results',
    relatedFiles: ['sections/main-search.liquid', 'snippets/search-results.liquid'],
    relatedSections: ['main-search'],
    detectionPattern: 'you-may-also|recommendations|no-results|search-empty',
    promptTemplate:
      'Add "You may also like" or recommendations when search has no or few results',
  },

  // ── PERSONALIZATION (5 patterns) ───────────────────────────────────────────
  {
    id: 'personalization-recently-viewed',
    category: 'personalization',
    name: 'Recently viewed',
    impact: 'high',
    description: 'Recently viewed products section',
    relatedFiles: ['sections/main-product.liquid', 'snippets/recently-viewed.liquid', 'layout/theme.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'recently-viewed|recently_viewed|recent-products',
    promptTemplate:
      'Add a recently viewed products section',
  },
  {
    id: 'personalization-wishlist',
    category: 'personalization',
    name: 'Wishlist',
    impact: 'high',
    description: 'Save products to wishlist',
    relatedFiles: ['snippets/product-card.liquid', 'sections/header.liquid', 'snippets/wishlist.liquid'],
    relatedSections: ['header', 'main-collection'],
    detectionPattern: 'wishlist|wish-list|save.*product|favorite',
    promptTemplate:
      'Add a wishlist feature to save products for later',
  },
  {
    id: 'personalization-back-in-stock',
    category: 'personalization',
    name: 'Back in stock alerts',
    impact: 'medium',
    description: 'Notify when out-of-stock product returns',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-form.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'back-in-stock|back_in_stock|notify.*stock|restock',
    promptTemplate:
      'Add back-in-stock notification signup for out-of-stock products',
  },
  {
    id: 'personalization-recommendations',
    category: 'personalization',
    name: 'Personalized recommendations',
    impact: 'high',
    description: 'Product recommendations based on browsing',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-recommendations.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'product-recommendations|recommendations|related-products',
    promptTemplate:
      'Add personalized product recommendations section',
  },
  {
    id: 'personalization-dynamic-collections',
    category: 'personalization',
    name: 'Dynamic collections',
    impact: 'medium',
    description: 'Collections that update based on rules or behavior',
    relatedFiles: ['sections/main-collection.liquid', 'snippets/collection-list.liquid'],
    relatedSections: ['main-collection'],
    detectionPattern: 'dynamic.*collection|collection.*rules|automated',
    promptTemplate:
      'Add or surface dynamic/automated collections',
  },

  // ── SEO (5 patterns) ────────────────────────────────────────────────────
  {
    id: 'seo-product-jsonld',
    category: 'personalization',
    name: 'Product JSON-LD',
    impact: 'high',
    description:
      'Structured data for product pages improves search appearance with rich snippets',
    relatedFiles: ['sections/main-product.liquid', 'snippets/product-jsonld.liquid'],
    relatedSections: ['main-product'],
    detectionPattern: 'application/ld\\+json|itemtype.*Product',
    promptTemplate:
      'Add JSON-LD structured data for the product page, including name, price, availability, image, and reviews',
  },
  {
    id: 'seo-breadcrumbs',
    category: 'navigation',
    name: 'Breadcrumb navigation',
    impact: 'medium',
    description:
      'Breadcrumbs improve navigation and generate breadcrumb rich snippets in search',
    relatedFiles: ['snippets/breadcrumb.liquid', 'sections/main-product.liquid'],
    relatedSections: ['main-product', 'main-collection'],
    detectionPattern: 'breadcrumb|BreadcrumbList',
    promptTemplate:
      'Add breadcrumb navigation with BreadcrumbList JSON-LD schema to the product and collection pages',
  },
  {
    id: 'seo-meta-descriptions',
    category: 'personalization',
    name: 'Unique meta descriptions',
    impact: 'high',
    description:
      'Unique meta descriptions per page improve click-through rate from search results',
    relatedFiles: ['layout/theme.liquid', 'snippets/meta-tags.liquid'],
    relatedSections: [],
    detectionPattern: 'meta.*description|page_description|seo\\.description',
    promptTemplate:
      'Ensure every page template has a unique meta description using page_description or seo.description, falling back to a generated summary',
  },
  {
    id: 'seo-image-alt',
    category: 'personalization',
    name: 'Descriptive image alt text',
    impact: 'medium',
    description:
      'Alt text on all images improves accessibility and image search visibility',
    relatedFiles: ['snippets/product-card.liquid', 'snippets/product-thumbnail.liquid'],
    relatedSections: ['main-product', 'collection-template'],
    detectionPattern: 'alt.*product\\.title|alt.*image\\.alt|alt=',
    promptTemplate:
      'Add descriptive alt text to all product images using product.title and variant information, not generic text',
  },
  {
    id: 'seo-canonical',
    category: 'personalization',
    name: 'Canonical URLs',
    impact: 'medium',
    description:
      'Canonical URLs prevent duplicate content issues across product variants and pagination',
    relatedFiles: ['layout/theme.liquid', 'snippets/meta-tags.liquid'],
    relatedSections: [],
    detectionPattern: 'rel.*canonical|canonical_url',
    promptTemplate:
      'Add canonical URL tags to the theme layout using canonical_url to prevent duplicate content across variants and paginated pages',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getPatternsByCategory(category: CXPattern['category']): CXPattern[] {
  return CX_PATTERNS.filter((p) => p.category === category);
}

export function getHighImpactPatterns(): CXPattern[] {
  return CX_PATTERNS.filter((p) => p.impact === 'high');
}
