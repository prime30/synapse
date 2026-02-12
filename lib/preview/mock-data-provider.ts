/**
 * Mock data presets for Shopify theme preview.
 * Provides realistic Shopify data shapes for customer, cart, and discount contexts.
 */

// ---------------------------------------------------------------------------
// Preset types
// ---------------------------------------------------------------------------

export type CustomerPreset = 'anonymous' | 'logged-in' | 'vip';
export type CartPreset = 'empty' | 'with-items' | 'large-cart';
export type DiscountPreset = 'none' | 'percentage' | 'fixed-amount' | 'bogo';

export interface MockDataConfig {
  customer: CustomerPreset;
  cart: CartPreset;
  discount: DiscountPreset;
}

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

export interface MockCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  tags: string[];
  accepts_marketing: boolean;
  default_address: {
    first_name: string;
    last_name: string;
    address1: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
}

export interface MockCartItem {
  id: number;
  variant_id: number;
  product_id: number;
  title: string;
  variant_title: string;
  sku: string;
  quantity: number;
  price: number;
  line_price: number;
  image: string;
  url: string;
  handle: string;
}

export interface MockCart {
  token: string;
  item_count: number;
  total_price: number;
  items: MockCartItem[];
  requires_shipping: boolean;
  currency: string;
  note: string;
}

export interface MockDiscount {
  code: string;
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
  amount: number;
  applicable: boolean;
  minimum_order_amount: number | null;
}

export interface MockPreviewData {
  customer: MockCustomer | null;
  cart: MockCart;
  discount: MockDiscount | null;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_MOCK_CONFIG: MockDataConfig = {
  customer: 'anonymous',
  cart: 'empty',
  discount: 'none',
};

// ---------------------------------------------------------------------------
// Customer presets
// ---------------------------------------------------------------------------

export function getCustomerPreset(preset: CustomerPreset): MockCustomer | null {
  switch (preset) {
    case 'anonymous':
      return null;

    case 'logged-in':
      return {
        id: 5_551_234_567,
        email: 'jane.doe@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
        orders_count: 3,
        total_spent: '28500',
        tags: [],
        accepts_marketing: true,
        default_address: {
          first_name: 'Jane',
          last_name: 'Doe',
          address1: '123 Main St',
          city: 'Toronto',
          province: 'Ontario',
          country: 'Canada',
          zip: 'M5V 2T6',
        },
      };

    case 'vip':
      return {
        id: 5_559_876_543,
        email: 'alex.vip@example.com',
        first_name: 'Alex',
        last_name: 'Rivera',
        orders_count: 47,
        total_spent: '1245000',
        tags: ['VIP', 'wholesale', 'loyalty-gold'],
        accepts_marketing: true,
        default_address: {
          first_name: 'Alex',
          last_name: 'Rivera',
          address1: '500 King St W',
          city: 'Toronto',
          province: 'Ontario',
          country: 'Canada',
          zip: 'M5V 1L9',
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Cart presets
// ---------------------------------------------------------------------------

function makeCartItem(overrides: Partial<MockCartItem> & { id: number }): MockCartItem {
  return {
    variant_id: 40_000_000_000 + overrides.id,
    product_id: 7_000_000_000 + overrides.id,
    title: 'Product',
    variant_title: 'Default',
    sku: `SKU-${overrides.id}`,
    quantity: 1,
    price: 2999,
    line_price: 2999,
    image: 'https://cdn.shopify.com/s/files/1/0000/0001/products/placeholder.png',
    url: '/products/product',
    handle: 'product',
    ...overrides,
  };
}

const CART_ITEMS_WITH_ITEMS: MockCartItem[] = [
  makeCartItem({
    id: 1,
    title: 'Classic Cotton T-Shirt',
    variant_title: 'Black / M',
    sku: 'TEE-BLK-M',
    price: 2999,
    line_price: 2999,
    handle: 'classic-cotton-t-shirt',
    url: '/products/classic-cotton-t-shirt',
  }),
  makeCartItem({
    id: 2,
    title: 'Slim Fit Chinos',
    variant_title: 'Navy / 32',
    sku: 'CHI-NVY-32',
    price: 6999,
    line_price: 6999,
    handle: 'slim-fit-chinos',
    url: '/products/slim-fit-chinos',
  }),
  makeCartItem({
    id: 3,
    title: 'Leather Belt',
    variant_title: 'Brown / One Size',
    sku: 'BLT-BRN-OS',
    price: 3499,
    line_price: 3499,
    handle: 'leather-belt',
    url: '/products/leather-belt',
  }),
];

const CART_ITEMS_LARGE: MockCartItem[] = [
  ...CART_ITEMS_WITH_ITEMS,
  makeCartItem({
    id: 4,
    title: 'Merino Wool Sweater',
    variant_title: 'Charcoal / L',
    sku: 'SWT-CHR-L',
    price: 8999,
    line_price: 8999,
    handle: 'merino-wool-sweater',
    url: '/products/merino-wool-sweater',
  }),
  makeCartItem({
    id: 5,
    title: 'Canvas Sneakers',
    variant_title: 'White / 10',
    sku: 'SNK-WHT-10',
    price: 5999,
    line_price: 5999,
    handle: 'canvas-sneakers',
    url: '/products/canvas-sneakers',
  }),
  makeCartItem({
    id: 6,
    title: 'Denim Jacket',
    variant_title: 'Indigo / M',
    sku: 'JKT-IND-M',
    price: 11999,
    line_price: 11999,
    handle: 'denim-jacket',
    url: '/products/denim-jacket',
  }),
  makeCartItem({
    id: 7,
    title: 'Graphic Hoodie',
    variant_title: 'Grey / L',
    sku: 'HOD-GRY-L',
    price: 5499,
    line_price: 5499,
    handle: 'graphic-hoodie',
    url: '/products/graphic-hoodie',
  }),
  makeCartItem({
    id: 8,
    title: 'Wool Beanie',
    variant_title: 'Black / One Size',
    sku: 'BNE-BLK-OS',
    price: 1999,
    line_price: 1999,
    handle: 'wool-beanie',
    url: '/products/wool-beanie',
  }),
  makeCartItem({
    id: 9,
    title: 'Sunglasses',
    variant_title: 'Tortoise',
    sku: 'SUN-TRT',
    price: 4999,
    line_price: 9998,
    quantity: 2,
    handle: 'sunglasses',
    url: '/products/sunglasses',
  }),
];

function sumLinePrice(items: MockCartItem[]): number {
  return items.reduce((sum, item) => sum + item.line_price, 0);
}

function sumItemCount(items: MockCartItem[]): number {
  return items.reduce((count, item) => count + item.quantity, 0);
}

export function getCartPreset(preset: CartPreset): MockCart {
  const base: Omit<MockCart, 'items' | 'item_count' | 'total_price'> = {
    token: 'c1f9d8e7b6a5432109876543210fedcb',
    requires_shipping: true,
    currency: 'USD',
    note: '',
  };

  switch (preset) {
    case 'empty':
      return { ...base, items: [], item_count: 0, total_price: 0 };

    case 'with-items':
      return {
        ...base,
        items: CART_ITEMS_WITH_ITEMS,
        item_count: sumItemCount(CART_ITEMS_WITH_ITEMS),
        total_price: sumLinePrice(CART_ITEMS_WITH_ITEMS),
      };

    case 'large-cart':
      return {
        ...base,
        items: CART_ITEMS_LARGE,
        item_count: sumItemCount(CART_ITEMS_LARGE),
        total_price: sumLinePrice(CART_ITEMS_LARGE),
      };
  }
}

// ---------------------------------------------------------------------------
// Discount presets
// ---------------------------------------------------------------------------

export function getDiscountPreset(preset: DiscountPreset): MockDiscount | null {
  switch (preset) {
    case 'none':
      return null;

    case 'percentage':
      return {
        code: 'SAVE20',
        type: 'percentage',
        amount: 20,
        applicable: true,
        minimum_order_amount: null,
      };

    case 'fixed-amount':
      return {
        code: 'TAKE10OFF',
        type: 'fixed_amount',
        amount: 1000,
        applicable: true,
        minimum_order_amount: 5000,
      };

    case 'bogo':
      return {
        code: 'BOGO2024',
        type: 'buy_x_get_y',
        amount: 0,
        applicable: true,
        minimum_order_amount: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Combined preset builder
// ---------------------------------------------------------------------------

export function getMockPreviewData(config: MockDataConfig): MockPreviewData {
  return {
    customer: getCustomerPreset(config.customer),
    cart: getCartPreset(config.cart),
    discount: getDiscountPreset(config.discount),
  };
}
