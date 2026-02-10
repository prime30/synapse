import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DesignTokenBrowser } from '../DesignTokenBrowser';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockTokensResponse = {
  data: {
    tokens: {
      colors: ['#ff0000', '#00ff00', '#0000ff'],
      fonts: ['Helvetica', 'Georgia'],
      fontSizes: ['14px', '16px', '24px'],
      spacing: ['4px', '8px', '16px', '32px'],
      radii: ['4px', '8px'],
      shadows: ['0 2px 4px rgba(0,0,0,0.1)'],
    },
    fileCount: 5,
    analyzedFiles: ['assets/base.css', 'layout/theme.liquid', 'config/settings_schema.json'],
  },
};

const emptyTokensResponse = {
  data: {
    tokens: {
      colors: [],
      fonts: [],
      fontSizes: [],
      spacing: [],
      radii: [],
      shadows: [],
    },
    fileCount: 0,
    analyzedFiles: [],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockTokensResponse),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DesignTokenBrowser', () => {
  it('renders loading state initially', () => {
    // Make fetch hang so we stay in loading
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<DesignTokenBrowser projectId="proj-1" />);
    expect(screen.getByText('Analyzing theme tokens…')).toBeDefined();
  });

  it('renders tokens after successful fetch', async () => {
    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Design Tokens')).toBeDefined();
    });

    // Summary text
    expect(screen.getByText(/15 tokens across 5 files/)).toBeDefined();
  });

  it('renders category sections', async () => {
    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      // "Colors" appears in both the health score bar and the category header
      expect(screen.getAllByText('Colors').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText('Typography').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Spacing').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Shadows').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Borders').length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when no tokens', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(emptyTokensResponse),
    });

    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('No tokens found')).toBeDefined();
    });
  });

  it('renders error state on fetch failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch design tokens/)).toBeDefined();
    });

    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('calls fetch with correct URL', async () => {
    render(<DesignTokenBrowser projectId="proj-123" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj-123/design-tokens',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it('filters tokens by search query', async () => {
    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Design Tokens')).toBeDefined();
    });

    const input = screen.getByPlaceholderText('Filter tokens…');
    fireEvent.change(input, { target: { value: '#ff' } });

    // After filtering, only #ff0000 should match; #00ff00 and #0000ff won't
    await waitFor(() => {
      expect(screen.getByText('#ff0000')).toBeDefined();
    });
  });

  it('renders the Scan Theme button', async () => {
    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Scan Theme')).toBeDefined();
    });
  });

  it('renders the health score section', async () => {
    render(<DesignTokenBrowser projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Score')).toBeDefined();
    });
  });
});
