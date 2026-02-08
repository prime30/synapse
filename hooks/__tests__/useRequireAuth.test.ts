import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// --- Mocks ---

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

// Import after mocks
import { useRequireAuth } from '../useRequireAuth';

// --- Tests ---

describe('useRequireAuth - REQ-8 TASK-3', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: onAuthStateChange returns an unsubscribe stub
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: { unsubscribe: vi.fn() },
      },
    });

    // Mock window.location.pathname for redirect callbackUrl
    Object.defineProperty(window, 'location', {
      value: { pathname: '/projects/123' },
      writable: true,
    });
  });

  it('should return isLoading true initially', () => {
    // getUser never resolves → stays in loading state
    mockGetUser.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRequireAuth());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should return user data when authenticated', async () => {
    const fakeUser = { id: 'user-1', email: 'test@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } });

    const { result } = renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should redirect to /auth/signin when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
    });

    expect(mockReplace).toHaveBeenCalledWith(
      '/auth/signin?callbackUrl=%2Fprojects%2F123',
    );
  });

  it('should subscribe to auth state changes', () => {
    mockGetUser.mockReturnValue(new Promise(() => {}));

    renderHook(() => useRequireAuth());

    expect(mockOnAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should unsubscribe on unmount', () => {
    const mockUnsubscribe = vi.fn();
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: { unsubscribe: mockUnsubscribe },
      },
    });
    mockGetUser.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderHook(() => useRequireAuth());
    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
