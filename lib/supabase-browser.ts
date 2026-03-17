import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabaseBrowser: SupabaseClient | null = null;

// Browser-safe Supabase client for Realtime subscriptions.
// Uses the anon (public) key — NOT the service role key.
// Lazy-initialized to avoid build-time crashes when env vars are absent.
export const supabaseBrowser: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseBrowser) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        throw new Error(
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
        );
      }
      _supabaseBrowser = createClient(url, key);
    }
    return (_supabaseBrowser as unknown as Record<string, unknown>)[prop as string];
  },
});
