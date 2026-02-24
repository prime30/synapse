import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const realtimeDebug = process.env.NEXT_PUBLIC_SUPABASE_REALTIME_DEBUG === '1';
  const options = realtimeDebug
    ? {
        realtime: {
          logger: (kind: string, msg: string, data?: unknown) => {
            console.log(`[Supabase Realtime] [${kind}] ${msg}`, data ?? '');
          },
        },
      }
    : {};

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options,
  );
}
