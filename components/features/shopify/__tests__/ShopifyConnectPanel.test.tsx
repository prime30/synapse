import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShopifyConnectPanel } from '../ShopifyConnectPanel';

// Mock Next.js app router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('ShopifyConnectPanel', () => {
  it('renders disconnected state with connect button', async () => {
    // Mock fetch to return disconnected status
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { connected: false, connection: null } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    render(<ShopifyConnectPanel projectId="project-1" />, { wrapper });

    // Wait for the query to resolve and render disconnected state
    const connectButton = await screen.findByText('Connect');
    expect(connectButton).toBeDefined();

    const input = screen.getByPlaceholderText('your-store-name');
    expect(input).toBeDefined();

    expect(screen.getByText('Shopify Store')).toBeDefined();
    expect(
      screen.getByText(
        'Connect a Shopify store to sync theme files.'
      )
    ).toBeDefined();
  });

  it('renders with QueryClientProvider wrapper', () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { connected: false, connection: null } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const { container } = render(
      <ShopifyConnectPanel projectId="project-1" />,
      { wrapper }
    );
    expect(container).toBeDefined();
  });
});
