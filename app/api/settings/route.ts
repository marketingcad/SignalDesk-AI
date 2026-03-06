import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Settings are stored in a `settings` table as key-value pairs:
//   id (text, PK) | value (jsonb) | updated_at (timestamptz)
//
// Known keys:
//   "platform_toggles" → { Facebook: true, LinkedIn: true, Reddit: true, X: false }
//   "alert_threshold"  → { value: 80 }
//   "notifications"    → { discord_enabled: true, email_enabled: true, discord_webhook_url: "..." }

type SettingsPayload = {
  platform_toggles?: Record<string, boolean>;
  alert_threshold?: { value: number };
  notifications?: {
    discord_enabled: boolean;
    email_enabled: boolean;
    discord_webhook_url: string;
  };
};

// GET /api/settings — load all settings
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("settings")
    .select("id, value");

  if (error) {
    console.error("[api/settings] GET error:", error);
    // Return defaults if table doesn't exist yet
    return NextResponse.json({
      platform_toggles: { Facebook: true, LinkedIn: true, Reddit: true, X: false },
      alert_threshold: { value: 80 },
      notifications: { discord_enabled: true, email_enabled: true, discord_webhook_url: "" },
    });
  }

  const settings: SettingsPayload = {};
  for (const row of data || []) {
    settings[row.id as keyof SettingsPayload] = row.value;
  }

  // Merge with defaults for any missing keys
  const result = {
    platform_toggles: settings.platform_toggles ?? { Facebook: true, LinkedIn: true, Reddit: true, X: false },
    alert_threshold: settings.alert_threshold ?? { value: 80 },
    notifications: settings.notifications ?? { discord_enabled: true, email_enabled: true, discord_webhook_url: "" },
  };

  return NextResponse.json(result);
}

// PUT /api/settings — save one or more settings sections
export async function PUT(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { key, value } = body as { key: string; value: unknown };

  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  const validKeys = ["platform_toggles", "alert_threshold", "notifications"];
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
