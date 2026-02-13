/**
 * Tests for the create token API route.
 *
 * Verifies validation, name sanitization, duplicate checking, and successful creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockCreateToken = vi.fn();
const mockFindByName = vi.fn();
const mockRequireProjectAccess = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/design-tokens/models/token-model', () => ({
  createToken: (...args: unknown[]) => mockCreateToken(...args),
  findByName: (...args: unknown[]) => mockFindByName(...args),
}));

vi.mock('@/lib/middleware/auth', () => ({
  requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args),
}));

// APIError mock — needs to throw objects that handleAPIError understands
vi.mock('@/lib/errors/handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors/handler')>('@/lib/errors/handler');
  return actual;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/projects/proj-1/design-tokens/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/projects/[projectId]/design-tokens/create', () => {
  it('creates token with valid input and returns 201', async () => {
    const fakeToken = {
      id: 'tok-1',
      name: 'color-primary',
      value: '#ff0000',
      category: 'color',
      project_id: 'proj-1',
    };

    mockFindByName.mockResolvedValue(null);
    mockCreateToken.mockResolvedValue(fakeToken);

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/create/route'
    );

    const response = await POST(
      makeRequest({ name: 'Color Primary', value: '#ff0000', category: 'color' }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.token).toEqual(fakeToken);

    // Verify name was sanitized
    expect(mockFindByName).toHaveBeenCalledWith('proj-1', 'color-primary');
    expect(mockCreateToken).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'color-primary' }),
    );
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/create/route'
    );

    const response = await POST(
      makeRequest({ value: '#ff0000', category: 'color' }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when category is invalid', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/create/route'
    );

    const response = await POST(
      makeRequest({ name: 'test', value: '#ff0000', category: 'invalid-cat' }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    expect(response.status).toBe(400);
  });

  it('returns 409 when token name already exists', async () => {
    mockFindByName.mockResolvedValue({ id: 'existing', name: 'test-token' });

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/create/route'
    );

    const response = await POST(
      makeRequest({ name: 'test token', value: '#ff0000', category: 'color' }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    expect(response.status).toBe(409);
  });

  it('sanitizes name: spaces to hyphens, lowercase', async () => {
    mockFindByName.mockResolvedValue(null);
    mockCreateToken.mockResolvedValue({ id: 'tok-1', name: 'my-great-token' });

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/create/route'
    );

    await POST(
      makeRequest({ name: '  My  Great  Token  ', value: '16px', category: 'spacing' }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    expect(mockCreateToken).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-great-token' }),
    );
  });
});
