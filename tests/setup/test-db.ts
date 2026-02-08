/**
 * Test database configuration for integration tests.
 * Use a separate Supabase project or test schema for integration tests
 * to avoid affecting development data.
 *
 * Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY in env
 * for tests that require a real database. Otherwise tests use mocks.
 */

const TEST_URL = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface TestDbConfig {
  url: string;
  serviceRoleKey: string;
  hasConfig: boolean;
}

/**
 * Returns test database configuration. hasConfig is false when running
 * without test DB env vars (e.g. CI without secrets); integration tests
 * that need a real DB should skip when !hasConfig.
 */
export function getTestDbConfig(): TestDbConfig {
  const hasConfig = Boolean(TEST_URL && TEST_SERVICE_KEY);
  return {
    url: TEST_URL ?? '',
    serviceRoleKey: TEST_SERVICE_KEY ?? '',
    hasConfig,
  };
}

/**
 * Condition for describe.skipWhen: skip integration tests that need
 * a real database when test DB is not configured.
 */
export function skipWhenNoTestDb(): boolean {
  return !getTestDbConfig().hasConfig;
}
