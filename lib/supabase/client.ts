import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        logger: (kind: string, msg: string, data?: unknown) => {
          console.log(`[Supabase Realtime] [${kind}] ${msg}`, data ?? '');
        },
      },
    }
  );
}
