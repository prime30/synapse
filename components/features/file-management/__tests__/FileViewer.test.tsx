import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileViewer } from '../FileViewer';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('FileViewer', () => {
  it('shows select file when no fileId', () => {
    render(<FileViewer fileId={null} />, { wrapper });
    expect(screen.getByText(/select a file/i)).toBeDefined();
  });
});
