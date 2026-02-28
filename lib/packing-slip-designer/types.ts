export type SlipTemplateId = 'minimal' | 'branded' | 'detailed' | 'compact';

export interface SlipTemplate {
  id: SlipTemplateId;
  name: string;
  description: string;
  liquid: string;
}

export interface MockLineItem {
  title: string;
  variant_title: string;
  sku: string;
  quantity: number;
  price: string;
  final_price: string;
  final_line_price: string;
  grams: number;
  image: string;
  requires_shipping: boolean;
  product: {
    title: string;
    type: string;
    vendor: string;
  };
  fulfillment: {
    tracking_number: string;
    tracking_company: string;
    tracking_url: string;
    created_at: string;
    status: string;
  } | null;
}

export interface MockAddress {
  name: string;
  first_name: string;
  last_name: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  province_code: string;
  country: string;
  country_code: string;
  zip: string;
  phone: string;
}

export interface MockOrder {
  id: number;
  name: string;
  order_number: number;
  email: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  shipping_price: string;
  note: string;
  cancelled: boolean;
  cancel_reason: string | null;
  line_items: MockLineItem[];
  shipping_address: MockAddress;
  billing_address: MockAddress;
  customer: {
    name: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
}

export interface MockShop {
  name: string;
  email: string;
  domain: string;
  url: string;
  currency: string;
  money_format: string;
  address: MockAddress;
}

export interface MockOrderContext {
  order: MockOrder;
  line_items: MockLineItem[];
  shipping_address: MockAddress;
  billing_address: MockAddress;
  shop: MockShop;
  shop_address: MockAddress;
  customer: MockOrder['customer'];
}

export interface SavedSlip {
  id: string;
  name: string;
  liquid: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlipStore {
  activeId: string | null;
  slips: SavedSlip[];
}

export interface RenderResult {
  html: string;
  error: null;
}

export interface RenderError {
  html: null;
  error: string;
}

export type RenderOutcome = RenderResult | RenderError;

export const SLIP_LABELS: Record<SlipTemplateId, string> = {
  minimal: 'Minimal',
  branded: 'Branded',
  detailed: 'Detailed',
  compact: 'Compact',
};

export const SLIP_DESCRIPTIONS: Record<SlipTemplateId, string> = {
  minimal: 'Clean, text-only layout. Order number, line items table with name, qty, and SKU, plus shipping address.',
  branded: 'Logo placeholder, styled header, product images, shipping and billing addresses, and order notes.',
  detailed: 'Full details: images, SKU, weight, price, fulfillment tracking, shipping and billing, notes, and barcode area.',
  compact: 'Space-efficient for small printers. Single-column, condensed typography, essentials only.',
};

export const SHOPIFY_VARIABLE_GROUPS = [
  {
    label: 'Order',
    variables: [
      '{{ order.name }}',
      '{{ order.order_number }}',
      '{{ order.email }}',
      '{{ order.created_at | date: "%B %d, %Y" }}',
      '{{ order.note }}',
      '{{ order.total_price | money }}',
      '{{ order.subtotal_price | money }}',
      '{{ order.total_tax | money }}',
      '{{ order.total_discounts | money }}',
      '{{ order.shipping_price | money }}',
    ],
  },
  {
    label: 'Line Items',
    variables: [
      '{% for line_item in line_items %}',
      '{{ line_item.title }}',
      '{{ line_item.variant_title }}',
      '{{ line_item.sku }}',
      '{{ line_item.quantity }}',
      '{{ line_item.price | money }}',
      '{{ line_item.final_line_price | money }}',
      '{{ line_item.image | img_tag }}',
      '{{ line_item.grams | weight_with_unit }}',
      '{% endfor %}',
    ],
  },
  {
    label: 'Shipping Address',
    variables: [
      '{{ shipping_address.name }}',
      '{{ shipping_address.company }}',
      '{{ shipping_address.address1 }}',
      '{{ shipping_address.address2 }}',
      '{{ shipping_address.city }}',
      '{{ shipping_address.province_code }}',
      '{{ shipping_address.country }}',
      '{{ shipping_address.zip }}',
      '{{ shipping_address.phone }}',
    ],
  },
  {
    label: 'Shop',
    variables: [
      '{{ shop.name }}',
      '{{ shop.email }}',
      '{{ shop.domain }}',
      '{{ shop_address.address1 }}',
      '{{ shop_address.city }}',
      '{{ shop_address.province_code }}',
      '{{ shop_address.country }}',
      '{{ shop_address.zip }}',
    ],
  },
  {
    label: 'Customer',
    variables: [
      '{{ customer.name }}',
      '{{ customer.email }}',
      '{{ customer.phone }}',
    ],
  },
] as const;
