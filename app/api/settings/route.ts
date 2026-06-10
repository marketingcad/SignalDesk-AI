import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { supabase } from "@/lib/supabase";

// Settings are stored in a `settings` table as key-value pairs:
//   id (text, PK) | value (jsonb) | updated_at (timestamptz)
//
// Known keys:
//   "platform_toggles" → { Facebook: true, LinkedIn: true, Reddit: true, X: false, Other: true }
//   "alert_threshold"  → { value: 80 }
//   "notifications"    → { discord_enabled: true, email_enabled: true, discord_webhook_url: "..." }
//   "date_range_filter"→ { enabled: false, mode: "today" | "range", startDate: "2026-05-01", endDate: "2026-05-30" }

type SettingsPayload = {
  platform_toggles?: Record<string, boolean>;
  alert_threshold?: { value: number };
  notifications?: {
    discord_enabled: boolean;
    email_enabled: boolean;
    discord_webhook_url: string;
  };
  date_range_filter?: {
    enabled: boolean;
    mode: "today" | "range";
    startDate: string;
    endDate: string;
  };
};

const DEFAULTS = {
  platform_toggles: { Facebook: true, LinkedIn: true, Reddit: true, X: false, Other: true },
  alert_threshold: { value: 80 },
  notifications: { discord_enabled: true, email_enabled: true, discord_webhook_url: "" },
  date_range_filter: { enabled: false, mode: "today", startDate: "", endDate: "" },
};

// GET /api/settings — load all settings
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("settings")
    .select("id, value");

  if (error) {
    console.error("[api/settings] GET error:", error);
    // Only fall back to defaults when the table doesn't exist yet (not migrated);
    // any other DB error is a genuine outage and must surface as 500, not a
    // success carrying fabricated defaults the user might then overwrite with.
    if (error.code === "42P01") {
      return NextResponse.json(DEFAULTS);
    }
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }

  const settings: SettingsPayload = {};
  for (const row of data || []) {
    settings[row.id as keyof SettingsPayload] = row.value;
  }

  // Merge with defaults for any missing keys
  const result = {
    platform_toggles: settings.platform_toggles ?? DEFAULTS.platform_toggles,
    alert_threshold: settings.alert_threshold ?? DEFAULTS.alert_threshold,
    notifications: settings.notifications ?? DEFAULTS.notifications,
    date_range_filter: settings.date_range_filter ?? DEFAULTS.date_range_filter,
  };

  // The Discord webhook URL is a secret. Redact it for non-admins so a member
  // cannot read it from the settings payload (they can still toggle alerts).
  if (result.notifications?.discord_webhook_url && !(await isAdmin(session))) {
    result.notifications = { ...result.notifications, discord_webhook_url: "" };
  }

  return NextResponse.json(result);
}

// PUT /api/settings — save one or more settings sections (admin only)
export async function PUT(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Settings are global/tenant-wide (incl. the Discord webhook); only admins may
  // change them so a member can't redirect notifications or disable alerting.
  if (!(await isAdmin(session))) {
    return NextResponse.json({ error: "Only an admin can change settings." }, { status: 403 });
  }

  let body: { key?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { key, value } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  const validKeys = ["platform_toggles", "alert_threshold", "notifications", "date_range_filter"];
  if (!validKeys.includes(key)) {
    return NextResponse.json({ error: "Invalid settings key" }, { status: 400 });
  }

  const { error } = await supabase
    .from("settings")
    .upsert({ id: key, value, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    console.error("[api/settings] PUT error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
