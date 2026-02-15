import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { createRef } from 'react';
import { FileEditor, type FileEditorHandle } from '../FileEditor';

// Mock the useFileEditor hook
vi.mock('@/hooks/useFileEditor', () => ({
  useFileEditor: vi.fn(),
}));

// Mock CollaborativeCursors component
vi.mock('@/components/editor/CollaborativeCursors', () => ({
  CollaborativeCursors: () => null,
}));

// Mock MonacoEditor as a controlled textarea so tests can query by role
vi.mock('@/components/editor/MonacoEditor', () => ({
  MonacoEditor: ({
    value,
    onChange,
    onSaveKeyDown,
  }: {
    value: string;
    onChange: (v: string) => void;
    onSaveKeyDown?: () => void;
  }) => (
    <textarea
      role="textbox"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          onSaveKeyDown?.();
        }
      }}
      aria-label="Editor"
    />
  ),
}));

// Mock useRemoteCursors hook (imported for type only, but mock for completeness)
vi.mock('@/hooks/useRemoteCursors', () => ({
  useRemoteCursors: vi.fn(() => []),
}));

import { useFileEditor } from '@/hooks/useFileEditor';

const mockUseFileEditor = vi.mocked(useFileEditor);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('FileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Select a file" when fileId is null', () => {
    mockUseFileEditor.mockReturnValue({
      content: '',
      setContent: vi.fn(),
      originalContent: '',
      isDirty: false,
      isLoading: false,
      file: null,
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId={null} />, { wrapper });
    expect(screen.getByText('Select a file')).toBeDefined();
  });

  it('shows "Loading..." when loading', () => {
    mockUseFileEditor.mockReturnValue({
      content: '',
      setContent: vi.fn(),
      originalContent: '',
      isDirty: false,
      isLoading: true,
      file: null,
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId="file-1" />, { wrapper });
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders textarea with content when fileId is provided', () => {
    mockUseFileEditor.mockReturnValue({
      content: 'file content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: false,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId="file-1" />, { wrapper });
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDefined();
    expect(textarea).toHaveProperty('value', 'file content');
  });

  it('does not render a toolbar (Save/Cancel moved to FileTabs)', () => {
    mockUseFileEditor.mockReturnValue({
      content: 'file content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: false,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId="file-1" />, { wrapper });
    // Save and Cancel buttons should not be in FileEditor anymore
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
  });

  it('exposes save() via imperative handle', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const mockOnSave = vi.fn();
    mockUseFileEditor.mockReturnValue({
      content: 'modified content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: true,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: mockSave,
      cancel: vi.fn(),
    });

    const ref = createRef<FileEditorHandle>();
    render(<FileEditor ref={ref} fileId="file-1" onSave={mockOnSave} />, { wrapper });

    expect(ref.current).toBeDefined();
    await ref.current!.save();
    expect(mockSave).toHaveBeenCalled();
    expect(mockOnSave).toHaveBeenCalled();
  });

  it('save() is a no-op when file is locked', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    mockUseFileEditor.mockReturnValue({
      content: 'modified content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: true,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: mockSave,
      cancel: vi.fn(),
    });

    const ref = createRef<FileEditorHandle>();
    render(<FileEditor ref={ref} fileId="file-1" locked />, { wrapper });

    await ref.current!.save();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('exposes cancel() via imperative handle', () => {
    const mockCancel = vi.fn();
    mockUseFileEditor.mockReturnValue({
      content: 'modified content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: true,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: vi.fn(),
      cancel: mockCancel,
    });

    const ref = createRef<FileEditorHandle>();
    render(<FileEditor ref={ref} fileId="file-1" />, { wrapper });

    ref.current!.cancel();
    expect(mockCancel).toHaveBeenCalled();
  });
});
