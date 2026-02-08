import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileList } from '../FileList';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('FileList', () => {
  it('shows select project when no projectId', () => {
    render(
      <FileList projectId={null} onFileClick={() => {}} />,
      { wrapper }
    );
    expect(screen.getByText(/select a project/i)).toBeDefined();
  });
});
