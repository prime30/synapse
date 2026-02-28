import { Liquid } from 'liquidjs';
import { registerShopifyFilters } from './shopify-filters';
import { MOCK_ORDER_CONTEXT } from './mock-order';
import type { MockOrderContext, RenderOutcome } from './types';

let engineInstance: Liquid | null = null;

function getEngine(): Liquid {
  if (!engineInstance) {
    engineInstance = new Liquid({
      strictVariables: false,
      strictFilters: false,
      lenientIf: true,
    });
    registerShopifyFilters(engineInstance);
  }
  return engineInstance;
}

/**
 * Renders a Liquid template string against mock (or custom) order data.
 * Returns `{ html, error: null }` on success, `{ html: null, error }` on failure.
 */
export async function renderPackingSlip(
  template: string,
  context?: Partial<MockOrderContext>,
): Promise<RenderOutcome> {
  if (!template.trim()) {
    return { html: '', error: null };
  }

  const engine = getEngine();
  const ctx = { ...MOCK_ORDER_CONTEXT, ...context };

  try {
    const html = await engine.parseAndRender(template, ctx);
    return { html: String(html), error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown Liquid render error';
    return { html: null, error: message };
  }
}
