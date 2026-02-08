import { describe, it, expect } from "vitest";
import shopifySchema from "../shopify-schema.json";
import { STANDARD_TAGS, type LiquidTagDefinition } from "../standard-tags";
import {
  STANDARD_FILTERS,
  type LiquidFilterDefinition,
} from "../standard-filters";

describe("Shopify schema JSON", () => {
  it("parses correctly and has an objects key", () => {
    expect(shopifySchema).toBeDefined();
    expect(shopifySchema.objects).toBeDefined();
    expect(typeof shopifySchema.objects).toBe("object");
  });

  it("contains all expected top-level object definitions", () => {
    const expectedObjects = [
      "product",
      "variant",
      "collection",
      "cart",
      "line_item",
      "customer",
      "shop",
      "page",
      "blog",
      "article",
      "image",
    ];

    for (const obj of expectedObjects) {
      expect(shopifySchema.objects).toHaveProperty(obj);
    }
  });

  it("product object has all required properties", () => {
    const product = shopifySchema.objects.product;
    expect(product).toBeDefined();
    expect(product.properties).toBeDefined();

    const requiredProps = [
      "title",
      "handle",
      "description",
      "price",
      "compare_at_price",
      "available",
      "type",
      "vendor",
      "tags",
      "variants",
      "images",
      "featured_image",
      "url",
      "id",
      "selected_variant",
      "options",
    ];

    for (const prop of requiredProps) {
      expect(product.properties).toHaveProperty(prop);
    }
  });

  it("product properties have correct types", () => {
    const props = shopifySchema.objects.product.properties;
    expect(props.title).toBe("string");
    expect(props.price).toBe("number");
    expect(props.available).toBe("boolean");
    expect(props.tags).toBe("array<string>");
    expect(props.variants).toBe("array<variant>");
    expect(props.featured_image).toBe("image");
    expect(props.id).toBe("number");
  });

  it("variant object has expected properties", () => {
    const variant = shopifySchema.objects.variant;
    expect(variant.properties.id).toBe("number");
    expect(variant.properties.title).toBe("string");
    expect(variant.properties.price).toBe("number");
    expect(variant.properties.sku).toBe("string");
    expect(variant.properties.available).toBe("boolean");
  });

  it("cart object references line_item and currency types", () => {
    const cart = shopifySchema.objects.cart;
    expect(cart.properties.items).toBe("array<line_item>");
    expect(cart.properties.currency).toBe("currency");
    expect(cart.properties.total_price).toBe("number");
  });
});

describe("Standard Liquid tags", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(STANDARD_TAGS)).toBe(true);
    expect(STANDARD_TAGS.length).toBeGreaterThan(0);
  });

  it("every entry conforms to LiquidTagDefinition", () => {
    for (const tag of STANDARD_TAGS) {
      expect(typeof tag.name).toBe("string");
      expect(typeof tag.requiresClosing).toBe("boolean");
      expect(typeof tag.syntax).toBe("string");
    }
  });

  it("includes core control-flow tags", () => {
    const names = STANDARD_TAGS.map((t) => t.name);
    expect(names).toContain("if");
    expect(names).toContain("elsif");
    expect(names).toContain("else");
    expect(names).toContain("unless");
    expect(names).toContain("case");
    expect(names).toContain("when");
    expect(names).toContain("for");
  });

  it("includes Shopify-specific tags", () => {
    const names = STANDARD_TAGS.map((t) => t.name);
    expect(names).toContain("form");
    expect(names).toContain("section");
    expect(names).toContain("schema");
    expect(names).toContain("javascript");
    expect(names).toContain("stylesheet");
    expect(names).toContain("layout");
    expect(names).toContain("render");
    expect(names).toContain("include");
  });

  it("marks block tags as requiring closing", () => {
    const blockTags = STANDARD_TAGS.filter((t) =>
      ["if", "for", "unless", "case", "capture", "comment", "raw", "form", "schema"].includes(
        t.name,
      ),
    );

    for (const tag of blockTags) {
      expect(tag.requiresClosing).toBe(true);
    }
  });

  it("marks standalone tags as not requiring closing", () => {
    const standaloneTags = STANDARD_TAGS.filter((t) =>
      ["assign", "increment", "decrement", "render", "include", "layout", "section"].includes(
        t.name,
      ),
    );

    for (const tag of standaloneTags) {
      expect(tag.requiresClosing).toBe(false);
    }
  });
});

describe("Standard Liquid filters", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(STANDARD_FILTERS)).toBe(true);
    expect(STANDARD_FILTERS.length).toBeGreaterThan(0);
  });

  it("every entry conforms to LiquidFilterDefinition", () => {
    for (const filter of STANDARD_FILTERS) {
      expect(typeof filter.name).toBe("string");
      expect(typeof filter.inputType).toBe("string");
      expect(typeof filter.outputType).toBe("string");
      expect(typeof filter.description).toBe("string");
    }
  });

  it("includes string filters", () => {
    const names = STANDARD_FILTERS.map((f) => f.name);
    expect(names).toContain("upcase");
    expect(names).toContain("downcase");
    expect(names).toContain("capitalize");
    expect(names).toContain("strip");
    expect(names).toContain("strip_html");
    expect(names).toContain("truncate");
    expect(names).toContain("replace");
    expect(names).toContain("escape");
    expect(names).toContain("url_encode");
  });

  it("includes number filters", () => {
    const names = STANDARD_FILTERS.map((f) => f.name);
    expect(names).toContain("plus");
    expect(names).toContain("minus");
    expect(names).toContain("times");
    expect(names).toContain("divided_by");
    expect(names).toContain("round");
    expect(names).toContain("abs");
  });

  it("includes array filters", () => {
    const names = STANDARD_FILTERS.map((f) => f.name);
    expect(names).toContain("join");
    expect(names).toContain("first");
    expect(names).toContain("last");
    expect(names).toContain("size");
    expect(names).toContain("map");
    expect(names).toContain("where");
    expect(names).toContain("sort");
    expect(names).toContain("reverse");
    expect(names).toContain("uniq");
    expect(names).toContain("concat");
    expect(names).toContain("compact");
  });

  it("includes Shopify-specific filters and marks them correctly", () => {
    const shopifyFilters = STANDARD_FILTERS.filter((f) => f.shopifySpecific === true);
    expect(shopifyFilters.length).toBeGreaterThan(0);

    const shopifyNames = shopifyFilters.map((f) => f.name);
    expect(shopifyNames).toContain("money");
    expect(shopifyNames).toContain("money_with_currency");
    expect(shopifyNames).toContain("money_without_currency");
    expect(shopifyNames).toContain("img_url");
    expect(shopifyNames).toContain("asset_url");
    expect(shopifyNames).toContain("product_img_url");
    expect(shopifyNames).toContain("shopify_asset_url");
    expect(shopifyNames).toContain("json");
    expect(shopifyNames).toContain("t");
    expect(shopifyNames).toContain("link_to");
    expect(shopifyNames).toContain("color_to_rgb");
    expect(shopifyNames).toContain("color_darken");
  });

  it("standard (non-Shopify) filters do not have shopifySpecific set", () => {
    const standardFilters = STANDARD_FILTERS.filter(
      (f) => !f.shopifySpecific,
    );
    expect(standardFilters.length).toBeGreaterThan(0);

    const standardNames = standardFilters.map((f) => f.name);
    expect(standardNames).toContain("upcase");
    expect(standardNames).toContain("plus");
    expect(standardNames).toContain("join");
  });
});
