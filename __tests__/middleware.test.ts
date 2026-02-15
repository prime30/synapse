import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---

// Mock @supabase/ssr createServerClient
const mockGetUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// Mock route-guard helpers (keep real logic for isPublicPath)
vi.mock('@/lib/auth/route-guard', () => ({
  isPublicPath: vi.fn((pathname: string) => {
    const publicPaths = ['/', '/auth/signin', '/auth/error'];
    const apiPublicPaths = ['/api/auth/', '/api/health'];
    if (publicPaths.includes(pathname)) return true;
    return apiPublicPaths.some((prefix) => pathname.startsWith(prefix));
  }),
  getRedirectUrl: vi.fn(
    (pathname: string) =>
      `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`,
  ),
}));

// Import after mocks
import { middleware } from '../middleware';

// --- Helpers ---

function createRequest(path: string, base = 'http://localhost:3000'): NextRequest {
  return new NextRequest(new URL(path, base));
}

// --- Tests ---

describe('Middleware - REQ-8 TASK-3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  describe('static / internal path skipping', () => {
    it('should skip _next/ paths without checking auth', async () => {
      const request = createRequest('/_next/static/chunk.js');
      const response = await middleware(request);
      expect(response.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it('should skip favicon.ico without checking auth', async () => {
      const request = createRequest('/favicon.ico');
      const response = await middleware(request);
      expect(response.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it('should skip /api/auth/ paths without checking auth', async () => {
      const request = createRequest('/api/auth/callback');
      const response = await middleware(request);
      expect(response.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  describe('public paths', () => {
    it('should allow unauthenticated access to / (home)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const request = createRequest('/');
      const response = await middleware(request);
      // Public path → no redirect (status 200)
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow unauthenticated access to /auth/signin', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const request = createRequest('/auth/signin');
      const response = await middleware(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('unauthenticated access to protected paths', () => {
    it('should redirect unauthenticated users to /auth/signin with callbackUrl', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const request = createRequest('/projects/123');
      const response = await middleware(request);
      expect(response.status).toBe(307);
      const location = response.headers.get('location')!;
      expect(location).toContain('/auth/signin');
      expect(location).toContain('callbackUrl=%2Fprojects%2F123');
    });

    it('should redirect unauthenticated users from /dashboard', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const request = createRequest('/dashboard');
      const response = await middleware(request);
      expect(response.status).toBe(307);
      const location = response.headers.get('location')!;
      expect(location).toContain('/auth/signin');
      expect(location).toContain('callbackUrl=%2Fdashboard');
    });
  });

  describe('authenticated users', () => {
    const fakeUser = { id: 'user-1', email: 'test@example.com' };

    it('should allow authenticated users through protected paths', async () => {
      mockGetUser.mockResolvedValue({ data: { user: fakeUser } });
      const request = createRequest('/projects/123');
      const response = await middleware(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should redirect authenticated users from /auth/signin to /onboarding', async () => {
      mockGetUser.mockResolvedValue({ data: { user: fakeUser } });
      const request = createRequest('/auth/signin');
      const response = await middleware(request);
      expect(response.status).toBe(307);
      const location = response.headers.get('location')!;
      expect(new URL(location).pathname).toBe('/onboarding');
    });

    it('should redirect authenticated users from /auth/signin to callbackUrl', async () => {
      mockGetUser.mockResolvedValue({ data: { user: fakeUser } });
      const request = createRequest('/auth/signin?callbackUrl=/dashboard');
      const response = await middleware(request);
      expect(response.status).toBe(307);
      const location = response.headers.get('location')!;
      expect(new URL(location).pathname).toBe('/dashboard');
    });
  });
});
