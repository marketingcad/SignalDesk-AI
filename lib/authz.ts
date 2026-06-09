import { supabase } from "@/lib/supabase";
import type { SessionPayload } from "@/lib/auth";

/**
 * Server-only authorization helpers. Kept separate from lib/auth.ts because this
 * imports the Supabase client (Node runtime) and must NOT be pulled into the edge
 * middleware bundle — middleware only needs verifySession (pure jose).
 */

/**
 * Returns true if the session belongs to an admin.
 *
 * Fast path: the role claim baked into the JWT at login.
 * Fallback: for sessions issued before the role claim existed, look the role up
 * from the database by user id. This means an admin's existing session starts
 * working the moment their users.role is set to 'admin' — no re-login required.
 *
 * Fails closed: if the role column is missing or the lookup errors, returns false.
 */
export async function isAdmin(session: SessionPayload): Promise<boolean> {
  if (session.role === "admin") return true;

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.userId)
    .maybeSingle();

  return data?.role === "admin";
}
