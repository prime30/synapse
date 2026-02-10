import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileEditor } from '../FileEditor';

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

  it('shows Save and Cancel buttons when fileId is provided', () => {
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
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('Save button is disabled initially (not dirty)', () => {
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
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDefined();
    expect(saveButton).toHaveProperty('disabled', true);
  });

  it('Cancel button is disabled initially (not dirty)', () => {
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
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeDefined();
    expect(cancelButton).toHaveProperty('disabled', true);
  });

  it('shows "Unsaved changes" when dirty', () => {
    mockUseFileEditor.mockReturnValue({
      content: 'modified content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: true,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId="file-1" />, { wrapper });
    expect(screen.getByText('Unsaved changes')).toBeDefined();
  });

  it('Save button is enabled when dirty', () => {
    mockUseFileEditor.mockReturnValue({
      content: 'modified content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: true,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId="file-1" />, { wrapper });
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDefined();
    expect(saveButton).toHaveProperty('disabled', false);
  });

  it('Cancel button is enabled when dirty', () => {
    mockUseFileEditor.mockReturnValue({
      content: 'modified content',
      setContent: vi.fn(),
      originalContent: 'file content',
      isDirty: true,
      isLoading: false,
      file: { id: 'file-1', name: 'test.liquid', content: 'file content', file_type: 'liquid' },
      save: vi.fn(),
      cancel: vi.fn(),
    });

    render(<FileEditor fileId="file-1" />, { wrapper });
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeDefined();
    expect(cancelButton).toHaveProperty('disabled', false);
  });

  it('renders textarea with content', () => {
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
});
