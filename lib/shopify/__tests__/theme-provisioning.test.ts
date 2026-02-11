import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureDevTheme } from '../theme-provisioning';

const mocks = vi.hoisted(() => ({
  getConnectionById: vi.fn(),
  updateThemeId: vi.fn(),
  getTheme: vi.fn(),
  createTheme: vi.fn(),
}));

vi.mock('../token-manager', () => ({
  ShopifyTokenManager: class {
    getConnectionById = mocks.getConnectionById;
    updateThemeId = mocks.updateThemeId;
  },
}));

vi.mock('../admin-api-factory', () => ({
  ShopifyAdminAPIFactory: {
    create: vi.fn().mockResolvedValue({
      getTheme: mocks.getTheme,
      createTheme: mocks.createTheme,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureDevTheme', () => {
  it('returns existing theme_id when theme is valid on Shopify', async () => {
    mocks.getConnectionById.mockResolvedValue({
      id: 'conn-1',
      project_id: 'proj-1',
      store_domain: 'store.myshopify.com',
      theme_id: '12345',
    });
    mocks.getTheme.mockResolvedValue({ id: 12345, name: 'Dev', role: 'unpublished' });

    const result = await ensureDevTheme('conn-1');

    expect(result).toBe('12345');
    expect(mocks.getTheme).toHaveBeenCalledWith(12345);
    expect(mocks.createTheme).not.toHaveBeenCalled();
    expect(mocks.updateThemeId).not.toHaveBeenCalled();
  });

  it('creates theme and persists theme_id when connection has no theme_id', async () => {
    const origEnv = process.env.SHOPIFY_DEV_THEME_ZIP_URL;
    process.env.SHOPIFY_DEV_THEME_ZIP_URL = 'https://example.com/theme.zip';

    mocks.getConnectionById.mockResolvedValue({
      id: 'conn-1',
      project_id: 'proj-1',
      store_domain: 'store.myshopify.com',
      theme_id: null,
    });
    mocks.createTheme.mockResolvedValue({
      id: 999,
      name: 'Synapse Dev - store',
      role: 'unpublished',
    });

    const result = await ensureDevTheme('conn-1');

    expect(result).toBe('999');
    expect(mocks.createTheme).toHaveBeenCalledWith(
      'Synapse Dev - store',
      'https://example.com/theme.zip',
      'unpublished'
    );
    expect(mocks.updateThemeId).toHaveBeenCalledWith('conn-1', '999');

    process.env.SHOPIFY_DEV_THEME_ZIP_URL = origEnv;
  });

  it('throws when connection not found', async () => {
    mocks.getConnectionById.mockResolvedValue(null);

    await expect(ensureDevTheme('conn-missing')).rejects.toThrow(
      /Shopify connection not found/
    );
  });

  it('throws when creating theme without zip URL', async () => {
    const origUrl = process.env.SHOPIFY_DEV_THEME_ZIP_URL;
    delete process.env.SHOPIFY_DEV_THEME_ZIP_URL;
    delete process.env.SHOPIFY_DEV_THEME_SRC;

    mocks.getConnectionById.mockResolvedValue({
      id: 'conn-1',
      project_id: 'proj-1',
      store_domain: 'store.myshopify.com',
      theme_id: null,
    });

    await expect(ensureDevTheme('conn-1')).rejects.toThrow(
      /SHOPIFY_DEV_THEME_ZIP_URL/
    );

    if (origUrl !== undefined) process.env.SHOPIFY_DEV_THEME_ZIP_URL = origUrl;
  });
});
