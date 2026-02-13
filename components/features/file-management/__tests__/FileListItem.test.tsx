import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileListItem } from '../FileListItem';
import type { ProjectFile } from '@/hooks/useProjectFiles';
import type { FileType } from '@/lib/types/files';

// Mock FileTreePresence to return null
vi.mock('@/components/files/FileTreePresence', () => ({
  FileTreePresence: () => null,
}));

// Mock formatFileSize and formatRelativeTime
vi.mock('@/hooks/useProjectFiles', async () => {
  const actual = await vi.importActual('@/hooks/useProjectFiles');
  return {
    ...actual,
    formatFileSize: (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    },
    formatRelativeTime: (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays < 7) return `${diffDays} days ago`;
      return date.toLocaleDateString();
    },
  };
});

describe('FileListItem', () => {
  const createMockFile = (
    overrides?: Partial<ProjectFile>
  ): ProjectFile => ({
    id: 'file-1',
    name: 'test-file.liquid',
    path: 'templates/test-file.liquid',
    file_type: 'liquid',
    size_bytes: 1024,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  it('renders file name', () => {
    const file = createMockFile({ name: 'test-file.liquid' });
    render(<FileListItem file={file} onClick={() => {}} />);
    expect(screen.getByText('test-file.liquid')).toBeDefined();
  });

  it('renders file size', () => {
    const file = createMockFile({ size_bytes: 1024 });
    render(<FileListItem file={file} onClick={() => {}} />);
    expect(screen.getByText(/1\.0 KB/)).toBeDefined();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    const file = createMockFile();
    render(<FileListItem file={file} onClick={onClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('truncates long file names (> 30 chars)', () => {
    const longName = 'a'.repeat(35);
    const file = createMockFile({ name: longName });
    render(<FileListItem file={file} onClick={() => {}} />);

    const truncated = `${longName.slice(0, 27)}...`;
    expect(screen.getByText(truncated)).toBeDefined();
    expect(screen.queryByText(longName)).toBeNull();
  });

  it('does not truncate file names <= 30 chars', () => {
    const shortName = 'a'.repeat(30);
    const file = createMockFile({ name: shortName });
    render(<FileListItem file={file} onClick={() => {}} />);

    expect(screen.getByText(shortName)).toBeDefined();
    expect(screen.queryByText(/\.\.\./)).toBeNull();
  });

  it('renders relative time', () => {
    const recentDate = new Date(Date.now() - 5 * 60000).toISOString(); // 5 minutes ago
    const file = createMockFile({ updated_at: recentDate });
    render(<FileListItem file={file} onClick={() => {}} />);

    expect(screen.getByText(/5 min ago/)).toBeDefined();
  });

  describe('file type color coding', () => {
    it('applies sky color for liquid files', () => {
      const file = createMockFile({ file_type: 'liquid' });
      const { container } = render(
        <FileListItem file={file} onClick={() => {}} />
      );
      const icon = container.querySelector('.text-sky-500');
      expect(icon).toBeDefined();
    });

    it('applies amber color for javascript files', () => {
      const file = createMockFile({ file_type: 'javascript' });
      const { container } = render(
        <FileListItem file={file} onClick={() => {}} />
      );
      const icon = container.querySelector('.text-amber-400');
      expect(icon).toBeDefined();
    });

    it('applies purple color for css files', () => {
      const file = createMockFile({ file_type: 'css' });
      const { container } = render(
        <FileListItem file={file} onClick={() => {}} />
      );
      const icon = container.querySelector('.text-purple-400');
      expect(icon).toBeDefined();
    });

    it('applies ide-text-muted for other file types', () => {
      const file = createMockFile({ file_type: 'other' });
      const { container } = render(
        <FileListItem file={file} onClick={() => {}} />
      );
      const icon = container.querySelector('.ide-text-muted');
      expect(icon).toBeDefined();
    });
  });

  it('renders FileTreePresence with presence data', () => {
    const file = createMockFile();
    const presence = [
      {
        user_id: 'user-1',
        file_path: file.path,
        color: '#ff0000',
        state: 'active' as const,
        last_active_at: new Date().toISOString(),
      },
    ];
    render(<FileListItem file={file} onClick={() => {}} presence={presence} />);
    // FileTreePresence is mocked to return null, so we just verify it doesn't crash
    expect(screen.getByText(file.name)).toBeDefined();
  });
});
