import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let _client: SupabaseClient | null = null;

/**
 * Lazily initialise a Supabase client for the scraper service.
 * Returns `null` if the required env vars are not set — the caller
 * should fall back to JSON file persistence.
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const url = config.supabaseUrl;
  const key = config.supabaseServiceRoleKey;
  if (!url || !key) return null;

  _client = createClient(url, key);
  return _client;
}
