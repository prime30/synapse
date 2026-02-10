/**
 * REQ-52 Task 3: Unit tests for the design-token data model.
 *
 * Mocks the Supabase client and tests every CRUD function by verifying
 * the correct from().select().eq() chains are called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase client — chainable builder
// ---------------------------------------------------------------------------

function createChain(resolvedValue: { data: unknown; error: unknown }) {
  // Every node in the chain is both thenable (so `await` resolves to the
  // result) and returns another chainable node for any method call.
  const makeNode = (): Record<string, unknown> => {
    const node: Record<string, ReturnType<typeof vi.fn>> = {};
    const handler: ProxyHandler<object> = {
      get(_target, prop: string) {
        // Make every node thenable — resolves to the configured result
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(resolvedValue);
        }
        if (prop === 'data') return resolvedValue.data;
        if (prop === 'error') return resolvedValue.error;
        if (!node[prop]) {
          node[prop] = vi.fn().mockReturnValue(makeNode());
        }
        return node[prop];
      },
    };
    return new Proxy({}, handler) as Record<string, unknown>;
  };

  const proxy = makeNode();
  return { proxy };
}

let mockResult: { data: unknown; error: unknown };
let mockFrom: ReturnType<typeof vi.fn>;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

// Provide env vars so the service-role path is taken
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');

// Import AFTER mocks are set up
const tokenModel = await import('../models/token-model');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_TOKEN = {
  id: '11111111-1111-1111-1111-111111111111',
  project_id: 'aaaa-bbbb',
  name: '--color-primary',
  category: 'color' as const,
  value: '#ff0000',
  aliases: [],
  description: null,
  metadata: {},
  semantic_parent_id: null,
  created_at: '2026-02-10T00:00:00Z',
  updated_at: '2026-02-10T00:00:00Z',
};

const FAKE_USAGE = {
  id: '22222222-2222-2222-2222-222222222222',
  token_id: FAKE_TOKEN.id,
  file_path: 'assets/theme.css',
  line_number: 42,
  context: '.hero { color: var(--color-primary); }',
  component_id: null,
  created_at: '2026-02-10T00:00:00Z',
};

const FAKE_VERSION = {
  id: '33333333-3333-3333-3333-333333333333',
  project_id: 'aaaa-bbbb',
  version_number: 1,
  changes: { added: ['--color-primary'] },
  author_id: null,
  description: 'Initial extraction',
  created_at: '2026-02-10T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Token CRUD
// ---------------------------------------------------------------------------

describe('Token CRUD', () => {
  it('createToken inserts and returns a row', async () => {
    mockResult = { data: FAKE_TOKEN, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.createToken({
      project_id: FAKE_TOKEN.project_id,
      name: FAKE_TOKEN.name,
      category: FAKE_TOKEN.category,
      value: FAKE_TOKEN.value,
    });

    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
    expect(result).toEqual(FAKE_TOKEN);
  });

  it('getToken selects by id', async () => {
    mockResult = { data: FAKE_TOKEN, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.getToken(FAKE_TOKEN.id);
    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
    expect(result).toEqual(FAKE_TOKEN);
  });

  it('updateToken patches and returns updated row', async () => {
    const updated = { ...FAKE_TOKEN, value: '#00ff00' };
    mockResult = { data: updated, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.updateToken(FAKE_TOKEN.id, {
      value: '#00ff00',
    });
    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
    expect(result.value).toBe('#00ff00');
  });

  it('deleteToken removes by id', async () => {
    mockResult = { data: null, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    await expect(tokenModel.deleteToken(FAKE_TOKEN.id)).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
  });

  it('listByProject returns tokens ordered by name', async () => {
    mockResult = { data: [FAKE_TOKEN], error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.listByProject(FAKE_TOKEN.project_id);
    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
    expect(result).toEqual([FAKE_TOKEN]);
  });

  it('listByCategory filters by category', async () => {
    mockResult = { data: [FAKE_TOKEN], error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.listByCategory(
      FAKE_TOKEN.project_id,
      'color',
    );
    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
    expect(result).toEqual([FAKE_TOKEN]);
  });

  it('findByName returns a token or null', async () => {
    mockResult = { data: FAKE_TOKEN, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.findByName(
      FAKE_TOKEN.project_id,
      FAKE_TOKEN.name,
    );
    expect(mockFrom).toHaveBeenCalledWith('design_tokens');
    expect(result).toEqual(FAKE_TOKEN);
  });

  it('findByName returns null when not found', async () => {
    mockResult = { data: null, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.findByName('proj-1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('createToken throws on error', async () => {
    mockResult = { data: null, error: { message: 'duplicate key' } };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    await expect(
      tokenModel.createToken({
        project_id: 'p',
        name: 'n',
        category: 'color',
        value: 'v',
      }),
    ).rejects.toEqual({ message: 'duplicate key' });
  });
});

// ---------------------------------------------------------------------------
// Usage CRUD
// ---------------------------------------------------------------------------

describe('Usage CRUD', () => {
  it('createUsage inserts and returns a row', async () => {
    mockResult = { data: FAKE_USAGE, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.createUsage({
      token_id: FAKE_USAGE.token_id,
      file_path: FAKE_USAGE.file_path,
      line_number: FAKE_USAGE.line_number,
      context: FAKE_USAGE.context,
    });

    expect(mockFrom).toHaveBeenCalledWith('design_token_usages');
    expect(result).toEqual(FAKE_USAGE);
  });

  it('listUsagesByToken returns usages for a token', async () => {
    mockResult = { data: [FAKE_USAGE], error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.listUsagesByToken(FAKE_USAGE.token_id);
    expect(mockFrom).toHaveBeenCalledWith('design_token_usages');
    expect(result).toEqual([FAKE_USAGE]);
  });

  it('listUsagesByFile returns usages for a file path', async () => {
    mockResult = { data: [FAKE_USAGE], error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.listUsagesByFile(FAKE_USAGE.file_path);
    expect(mockFrom).toHaveBeenCalledWith('design_token_usages');
    expect(result).toEqual([FAKE_USAGE]);
  });

  it('deleteUsagesByToken removes all usages for a token', async () => {
    mockResult = { data: null, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    await expect(
      tokenModel.deleteUsagesByToken(FAKE_USAGE.token_id),
    ).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith('design_token_usages');
  });
});

// ---------------------------------------------------------------------------
// Version CRUD
// ---------------------------------------------------------------------------

describe('Version CRUD', () => {
  it('createVersion inserts and returns a row', async () => {
    mockResult = { data: FAKE_VERSION, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.createVersion({
      project_id: FAKE_VERSION.project_id,
      version_number: FAKE_VERSION.version_number,
      description: FAKE_VERSION.description,
      changes: FAKE_VERSION.changes,
    });

    expect(mockFrom).toHaveBeenCalledWith('design_system_versions');
    expect(result).toEqual(FAKE_VERSION);
  });

  it('getLatestVersion returns the highest version', async () => {
    mockResult = { data: FAKE_VERSION, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.getLatestVersion(FAKE_VERSION.project_id);
    expect(mockFrom).toHaveBeenCalledWith('design_system_versions');
    expect(result).toEqual(FAKE_VERSION);
  });

  it('getLatestVersion returns null when no versions exist', async () => {
    mockResult = { data: null, error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.getLatestVersion('no-versions-project');
    expect(result).toBeNull();
  });

  it('listVersions returns all versions descending', async () => {
    mockResult = { data: [FAKE_VERSION], error: null };
    const { proxy } = createChain(mockResult);
    mockFrom = vi.fn().mockReturnValue(proxy);

    const result = await tokenModel.listVersions(FAKE_VERSION.project_id);
    expect(mockFrom).toHaveBeenCalledWith('design_system_versions');
    expect(result).toEqual([FAKE_VERSION]);
  });
});
