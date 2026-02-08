import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VersionHistoryPanel } from '../VersionHistoryPanel';
import type { FileVersion } from '@/lib/types/version';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const noOp = () => {};

function makeVersion(overrides: Partial<FileVersion> = {}): FileVersion {
  return {
    id: 'ver-1',
    file_id: 'file-1',
    version_number: 1,
    content: 'hello',
    metadata: {},
    structure: {},
    relationships: {},
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    change_summary: null,
    parent_version_id: null,
    ...overrides,
  };
}

describe('VersionHistoryPanel', () => {
  it('renders empty state when no versions', () => {
    render(
      <VersionHistoryPanel
        versions={[]}
        currentVersion={0}
        isLoading={false}
        onUndo={noOp}
        onRedo={noOp}
        onRestore={noOp}
      />,
      { wrapper }
    );
    expect(screen.getByText('No version history yet')).toBeDefined();
  });

  it('renders the panel header', () => {
    render(
      <VersionHistoryPanel
        versions={[]}
        currentVersion={0}
        isLoading={false}
        onUndo={noOp}
        onRedo={noOp}
        onRestore={noOp}
      />,
      { wrapper }
    );
    expect(screen.getByText('Version History')).toBeDefined();
  });

  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(
      <VersionHistoryPanel
        versions={[]}
        currentVersion={1}
        isLoading={true}
        onUndo={noOp}
        onRedo={noOp}
        onRestore={noOp}
      />,
      { wrapper }
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders version items when versions are provided', () => {
    const versions: FileVersion[] = [
      makeVersion({ id: 'v1', version_number: 1, change_summary: 'Initial' }),
      makeVersion({ id: 'v2', version_number: 2, change_summary: 'Edit' }),
    ];

    render(
      <VersionHistoryPanel
        versions={versions}
        currentVersion={2}
        isLoading={false}
        onUndo={noOp}
        onRedo={noOp}
        onRestore={noOp}
      />,
      { wrapper }
    );
    expect(screen.getByText('Version 1')).toBeDefined();
    expect(screen.getByText('Version 2')).toBeDefined();
    expect(screen.getByText('Current')).toBeDefined();
  });

  it('toggles panel open and closed', () => {
    render(
      <VersionHistoryPanel
        versions={[]}
        currentVersion={0}
        isLoading={false}
        onUndo={noOp}
        onRedo={noOp}
        onRestore={noOp}
      />,
      { wrapper }
    );
    const toggle = screen.getByText('Version History');
    expect(screen.getByText('No version history yet')).toBeDefined();

    fireEvent.click(toggle);
    expect(screen.queryByText('No version history yet')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText('No version history yet')).toBeDefined();
  });

  it('calls onRestore when restore button is clicked', () => {
    const onRestore = vi.fn();
    const versions: FileVersion[] = [
      makeVersion({ id: 'v1', version_number: 1 }),
      makeVersion({ id: 'v2', version_number: 2 }),
    ];

    render(
      <VersionHistoryPanel
        versions={versions}
        currentVersion={2}
        isLoading={false}
        onUndo={noOp}
        onRedo={noOp}
        onRestore={onRestore}
      />,
      { wrapper }
    );
    const restoreButton = screen.getByText('Restore');
    fireEvent.click(restoreButton);
    expect(onRestore).toHaveBeenCalledWith('v1');
  });
});
