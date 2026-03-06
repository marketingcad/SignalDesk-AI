import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-safe Supabase client for Realtime subscriptions.
// Uses the anon (public) key — NOT the service role key.
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);
