/**
 * Tests for the versions API route logic.
 *
 * Verifies that the GET endpoint returns versions sorted by version_number
 * descending, and that POST rollback handles valid and invalid version IDs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockListVersions = vi.fn();
const mockRollback = vi.fn();
const mockRequireProjectAccess = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/design-tokens/models/token-model', () => ({
  listVersions: (...args: unknown[]) => mockListVersions(...args),
}));

vi.mock('@/lib/middleware/auth', () => ({
  requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args),
}));

vi.mock('@/lib/design-tokens/application/token-applicator', () => {
  return {
    TokenApplicator: class {
      rollback(...args: unknown[]) {
        return mockRollback(...args);
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const FAKE_VERSIONS = [
  {
    id: 'v3',
    project_id: 'proj-1',
    version_number: 3,
    changes: { added: ['token-c'] },
    description: 'v3',
    created_at: '2026-02-10T03:00:00Z',
  },
  {
    id: 'v2',
    project_id: 'proj-1',
    version_number: 2,
    changes: { added: ['token-b'] },
    description: 'v2',
    created_at: '2026-02-10T02:00:00Z',
  },
  {
    id: 'v1',
    project_id: 'proj-1',
    version_number: 1,
    changes: { added: ['token-a'] },
    description: 'v1',
    created_at: '2026-02-10T01:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/projects/[projectId]/design-tokens/versions', () => {
  it('returns versions array sorted by version_number descending', async () => {
    mockListVersions.mockResolvedValue(FAKE_VERSIONS);

    const { GET } = await import(
      '@/app/api/projects/[projectId]/design-tokens/versions/route'
    );

    const request = new Request('http://localhost/api/projects/proj-1/design-tokens/versions');
    const response = await GET(request as any, {
      params: Promise.resolve({ projectId: 'proj-1' }),
    });

    const json = await response.json();
    expect(json.data.versions).toHaveLength(3);
    expect(json.data.versions[0].version_number).toBe(3);
    expect(json.data.versions[2].version_number).toBe(1);
  });

  it('returns empty array when no versions exist', async () => {
    mockListVersions.mockResolvedValue([]);

    const { GET } = await import(
      '@/app/api/projects/[projectId]/design-tokens/versions/route'
    );

    const request = new Request('http://localhost/api/projects/proj-1/design-tokens/versions');
    const response = await GET(request as any, {
      params: Promise.resolve({ projectId: 'proj-1' }),
    });

    const json = await response.json();
    expect(json.data.versions).toEqual([]);
  });
});

describe('POST /api/projects/[projectId]/design-tokens/versions/[versionId]/rollback', () => {
  it('succeeds with valid versionId', async () => {
    mockRollback.mockResolvedValue(undefined);

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/versions/[versionId]/rollback/route'
    );

    const request = new Request('http://localhost/rollback', { method: 'POST' });
    const response = await POST(request as any, {
      params: Promise.resolve({ projectId: 'proj-1', versionId: 'v2' }),
    });

    const json = await response.json();
    expect(json.data.success).toBe(true);
    expect(mockRollback).toHaveBeenCalledWith('proj-1', 'v2');
  });

  it('returns error when rollback throws', async () => {
    mockRollback.mockRejectedValue(new Error('Version not found'));

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/versions/[versionId]/rollback/route'
    );

    const request = new Request('http://localhost/rollback', { method: 'POST' });
    const response = await POST(request as any, {
      params: Promise.resolve({ projectId: 'proj-1', versionId: 'nonexistent' }),
    });

    // Should return an error response (handleAPIError catches and returns 500)
    const json = await response.json();
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
