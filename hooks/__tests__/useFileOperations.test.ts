import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFileOperations } from '../useFileOperations';

// Mock global fetch
global.fetch = vi.fn();

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Store original createElement
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockClear();
  (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockClear();
});

describe('useFileOperations', () => {
  describe('renameFile', () => {
    it('calls PATCH with correct body', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useFileOperations());
      
      await result.current.renameFile('file-123', 'new-name.txt');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/file-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-name.txt' }),
      });
    });

    it('calls onSuccess on success', async () => {
      const onSuccess = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() =>
        useFileOperations({ onSuccess })
      );

      await result.current.renameFile('file-123', 'new-name.txt');

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('File renamed');
      });
    });

    it('calls onError on failure', async () => {
      const onError = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Rename failed' }),
      });

      const { result } = renderHook(() => useFileOperations({ onError }));

      await expect(
        result.current.renameFile('file-123', 'new-name.txt')
      ).rejects.toThrow();

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Rename failed');
      });
    });
  });

  describe('deleteFile', () => {
    it('calls DELETE', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useFileOperations());

      await result.current.deleteFile('file-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/file-123', {
        method: 'DELETE',
      });
    });

    it('calls onSuccess on success', async () => {
      const onSuccess = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() =>
        useFileOperations({ onSuccess })
      );

      await result.current.deleteFile('file-123');

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('File deleted');
      });
    });

    it('calls onError on failure', async () => {
      const onError = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Delete failed' }),
      });

      const { result } = renderHook(() => useFileOperations({ onError }));

      await expect(result.current.deleteFile('file-123')).rejects.toThrow();

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Delete failed');
      });
    });
  });

  describe('duplicateFile', () => {
    it('calls POST and returns data', async () => {
      const mockFileData = { id: 'file-456', name: 'duplicated.txt' };
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockFileData }),
      });

      const { result } = renderHook(() => useFileOperations());

      const resultData = await result.current.duplicateFile('file-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/file-123/duplicate', {
        method: 'POST',
      });
      expect(resultData).toEqual(mockFileData);
    });

    it('calls onSuccess on success', async () => {
      const onSuccess = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'file-456' } }),
      });

      const { result } = renderHook(() =>
        useFileOperations({ onSuccess })
      );

      await result.current.duplicateFile('file-123');

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('File duplicated');
      });
    });

    it('returns null and calls onError on failure', async () => {
      const onError = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Duplicate failed' }),
      });

      const { result } = renderHook(() => useFileOperations({ onError }));

      const resultData = await result.current.duplicateFile('file-123');

      expect(resultData).toBeNull();
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Duplicate failed');
      });
    });
  });

  describe('downloadFile', () => {
    it('creates blob download', async () => {
      // Mock document.createElement for download link
      const mockClick = vi.fn();
      const mockLink = {
        href: '',
        download: '',
        click: mockClick,
      };
      
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return mockLink as unknown as HTMLElement;
        }
        return originalCreateElement(tagName);
      });

      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { content: 'file content' } }),
      });

      const { result } = renderHook(() => useFileOperations());

      await result.current.downloadFile('file-123', 'test.txt');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/file-123');
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      expect(mockLink.download).toBe('test.txt');
      
      createElementSpy.mockRestore();
    });

    it('calls onSuccess on success', async () => {
      // Mock document.createElement for download link
      const mockClick = vi.fn();
      const mockLink = {
        href: '',
        download: '',
        click: mockClick,
      };
      
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return mockLink as unknown as HTMLElement;
        }
        return originalCreateElement(tagName);
      });

      const onSuccess = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { content: 'file content' } }),
      });

      const { result } = renderHook(() =>
        useFileOperations({ onSuccess })
      );

      await result.current.downloadFile('file-123', 'test.txt');

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('File downloaded');
      });
      
      createElementSpy.mockRestore();
    });

    it('calls onError on failure', async () => {
      const onError = vi.fn();
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Download failed' }),
      });

      const { result } = renderHook(() => useFileOperations({ onError }));

      await expect(
        result.current.downloadFile('file-123', 'test.txt')
      ).rejects.toThrow();

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Download failed');
      });
    });
  });

  describe('copyContent', () => {
    it('calls navigator.clipboard.writeText', async () => {
      const mockWriteText = navigator.clipboard.writeText as ReturnType<
        typeof vi.fn
      >;
      mockWriteText.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useFileOperations());

      await result.current.copyContent('content to copy');

      expect(mockWriteText).toHaveBeenCalledWith('content to copy');
    });

    it('calls onSuccess on success', async () => {
      const onSuccess = vi.fn();
      const mockWriteText = navigator.clipboard.writeText as ReturnType<
        typeof vi.fn
      >;
      mockWriteText.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useFileOperations({ onSuccess })
      );

      await result.current.copyContent('content to copy');

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('Copied!');
      });
    });

    it('calls onError on failure', async () => {
      const onError = vi.fn();
      const mockWriteText = navigator.clipboard.writeText as ReturnType<
        typeof vi.fn
      >;
      mockWriteText.mockRejectedValueOnce(new Error('Copy failed'));

      const { result } = renderHook(() => useFileOperations({ onError }));

      await expect(
        result.current.copyContent('content to copy')
      ).rejects.toThrow();

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Copy failed');
      });
    });
  });
});
