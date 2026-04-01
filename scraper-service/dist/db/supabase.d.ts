import { type SupabaseClient } from "@supabase/supabase-js";
/**
 * Lazily initialise a Supabase client for the scraper service.
 * Returns `null` if the required env vars are not set — the caller
 * should fall back to JSON file persistence.
 */
export declare function getSupabase(): SupabaseClient | null;
