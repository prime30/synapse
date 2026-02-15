import { Resend } from 'resend';

/**
 * Lazy-initialised Resend client.
 *
 * Resend's constructor throws when the API key is missing. Eager instantiation
 * at module load crashed every route that transitively imports lib/email
 * (including /api/agents/stream via billing → spending-monitor → email).
 *
 * The Proxy defers construction until a property is accessed. sendEmail() guards
 * with an early return when RESEND_API_KEY is not set, so the Proxy's get trap
 * is never invoked in that case — module load succeeds without the key.
 */
let _instance: Resend | null = null;

function getInstance(): Resend {
  if (!_instance) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY is not set. Add it to .env to enable spending alert emails.');
    }
    _instance = new Resend(key);
  }
  return _instance;
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return (getInstance() as Record<string | symbol, unknown>)[prop];
  },
});
