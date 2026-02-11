import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordPush,
  listPushHistory,
  rollbackToPush,
  buildSnapshotForConnection,
  PUSH_TRIGGERS,
} from '../push-history';

const mocks = vi.hoisted(() => ({
  getTheme: vi.fn(),
  putAsset: vi.fn(),
  mockFromImpl: vi.fn((_table: string) => ({} as Record<string, unknown>)),
}));

vi.mock('../admin-api-factory', () => ({
  ShopifyAdminAPIFactory: {
    create: vi.fn().mockResolvedValue({
      getTheme: mocks.getTheme,
      putAsset: mocks.putAsset,
    }),
  },
}));

vi.mock('@/lib/storage/files', () => ({
  downloadFromStorage: vi.fn().mockResolvedValue('content-from-storage'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    get from() {
      return (table: string) => mocks.mockFromImpl(table);
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockFromImpl.mockImplementation((_table: string) => ({}));
});

describe('push-history', () => {
  describe('PUSH_TRIGGERS', () => {
    it('includes allowed trigger values', () => {
      expect(PUSH_TRIGGERS).toContain('manual');
      expect(PUSH_TRIGGERS).toContain('import');
      expect(PUSH_TRIGGERS).toContain('auto_save');
      expect(PUSH_TRIGGERS).toContain('rollback');
    });
  });

  describe('recordPush', () => {
    it('inserts a row and returns id', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table !== 'theme_push_history') return {};
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: 'push-uuid-1' },
                  error: null,
                }),
            }),
          }),
        };
      });

      const id = await recordPush('conn-1', '12345', { files: [{ path: 'a.liquid', content: 'x' }] }, {
        note: 'Test',
        trigger: 'import',
      });

      expect(id).toBe('push-uuid-1');
    });

    it('defaults trigger to manual when not provided', async () => {
      let insertPayload: unknown;
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table !== 'theme_push_history') return {};
        return {
          insert: (payload: unknown) => {
            insertPayload = payload;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: 'id-1' }, error: null }),
              }),
            };
          },
        };
      });

      await recordPush('conn-1', '99', { files: [] });

      expect(insertPayload).toEqual(
        expect.objectContaining({ trigger: 'manual' })
      );
    });

    it('throws on invalid trigger', async () => {
      await expect(
        recordPush('conn-1', '99', { files: [] }, { trigger: 'invalid' as 'manual' })
      ).rejects.toThrow(/Invalid trigger/);
    });
  });

  describe('listPushHistory', () => {
    it('returns empty array when no connection', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const list = await listPushHistory('proj-1', 25);

      expect(list).toEqual([]);
    });

    it('returns rows with file_count from snapshot', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { shopify_connection_id: 'conn-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'theme_push_history') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          id: 'p1',
                          pushed_at: '2025-01-01T12:00:00Z',
                          note: 'Note',
                          trigger: 'manual',
                          snapshot: { files: [{ path: 'a' }, { path: 'b' }] },
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const list = await listPushHistory('proj-1', 25);

      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        id: 'p1',
        pushed_at: '2025-01-01T12:00:00Z',
        note: 'Note',
        trigger: 'manual',
        file_count: 2,
      });
    });
  });

  describe('rollbackToPush', () => {
    it('throws not found when push row missing', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table === 'theme_push_history') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'not found' },
                  }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(rollbackToPush('push-id', 'proj-1')).rejects.toThrow(/not found|Push record/);
    });

    it('throws forbidden when push does not belong to project', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table === 'theme_push_history') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      connection_id: 'conn-1',
                      theme_id: '123',
                      pushed_at: null,
                      snapshot: { files: [] },
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { shopify_connection_id: 'conn-other' }, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(rollbackToPush('push-id', 'proj-other')).rejects.toThrow(/does not belong|forbidden/i);
    });

    it('throws when theme is main', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table === 'theme_push_history') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      connection_id: 'conn-1',
                      theme_id: '123',
                      pushed_at: '2025-01-01T00:00:00Z',
                      snapshot: { files: [] },
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { shopify_connection_id: 'conn-1' }, error: null }),
              }),
            }),
          };
        }
        return {};
      });
      mocks.getTheme.mockResolvedValue({ id: 123, role: 'main' });

      await expect(rollbackToPush('push-id', 'proj-1')).rejects.toThrow(/live theme|Cannot update/);
    });

    it('calls putAsset for each file and returns restored count', async () => {
      mocks.mockFromImpl.mockImplementation((table: string) => {
        if (table === 'theme_push_history') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      connection_id: 'conn-1',
                      theme_id: '123',
                      pushed_at: '2025-01-01T00:00:00Z',
                      snapshot: {
                        files: [
                          { path: 'a.liquid', content: 'a' },
                          { path: 'b.liquid', content: 'b' },
                        ],
                      },
                    },
                    error: null,
                  }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: 'rollback-id' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { shopify_connection_id: 'conn-1' }, error: null }),
              }),
            }),
          };
        }
        return {};
      });
      mocks.getTheme.mockResolvedValue({ id: 123, role: 'unpublished' });
      mocks.putAsset.mockResolvedValue({});

      const result = await rollbackToPush('push-id', 'proj-1');

      expect(result.restored).toBe(2);
      expect(result.errors).toEqual([]);
      expect(mocks.putAsset).toHaveBeenCalledWith(123, 'a.liquid', 'a');
      expect(mocks.putAsset).toHaveBeenCalledWith(123, 'b.liquid', 'b');
    });
  });

  describe('buildSnapshotForConnection', () => {
    it('returns empty snapshot when no pending theme_files', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };

      const snapshot = await buildSnapshotForConnection(
        supabase as never,
        'conn-1',
        'proj-1'
      );

      expect(snapshot.files).toEqual([]);
    });
  });
});
