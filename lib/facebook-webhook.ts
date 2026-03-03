import crypto from "crypto";
import { supabase } from "./supabase";
import { classifyText, type PostClassification } from "./keywords";

// Re-export for backwards compatibility with the webhook route
export type { PostClassification };
export const classifyPost = classifyText;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FacebookPostEvent {
  group_id: string;
  post_id: string;
  author_name: string;
  message: string;
  created_time: string;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (X-Hub-Signature-256)
// ---------------------------------------------------------------------------

export function verifySignature(
  payload: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Discord notification
// ---------------------------------------------------------------------------

interface DiscordPayload {
  type: PostClassification;
  author_name: string;
  message: string;
  post_id: string;
  created_time: string;
}

export async function sendDiscordNotification(
  payload: DiscordPayload
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[facebook-webhook] DISCORD_WEBHOOK_URL is not configured");
    return;
  }

  const emoji = payload.type === "HIRING_VA" ? "🟢" : "🔵";
  const label =
    payload.type === "HIRING_VA" ? "HIRING VA" : "SEEKING WORK";
  const postLink = `https://facebook.com/${payload.post_id}`;

  const content = [
    `${emoji} **NEW ${label} POST FOUND**`,
    "",
    `👤 **Author:** ${payload.author_name}`,
    `📌 **Message:** ${payload.message.slice(0, 500)}`,
    `🔗 **Link:** ${postLink}`,
    `🕒 **Time:** ${payload.created_time}`,
  ].join("\n");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    console.error(
      `[facebook-webhook] Discord notification failed: ${res.status} ${res.statusText}`
    );
  }
}

// ---------------------------------------------------------------------------
// Supabase: duplicate check + insert
// ---------------------------------------------------------------------------

export async function isDuplicate(post_id: string): Promise<boolean> {
  const { data } = await supabase
    .from("facebook_post_logs")
    .select("id")
    .eq("post_id", post_id)
    .maybeSingle();

  return !!data;
}

export async function insertPostLog(
  event: FacebookPostEvent,
  classification: PostClassification
): Promise<void> {
  const { error } = await supabase.from("facebook_post_logs").insert({
    group_id: event.group_id,
    post_id: event.post_id,
    author_name: event.author_name,
    message: event.message,
    classification,
    created_time: event.created_time,
    notified: true,
  });

  if (error) {
    console.error("[facebook-webhook] Supabase insert error:", error);
  }
}

// ---------------------------------------------------------------------------
// Parse incoming webhook body into structured events
// ---------------------------------------------------------------------------

export function extractPostEvents(
  body: Record<string, unknown>
): FacebookPostEvent[] {
  const events: FacebookPostEvent[] = [];
  const entries = (body.entry as Array<Record<string, unknown>>) || [];

  for (const entry of entries) {
    const changes =
      (entry.changes as Array<Record<string, unknown>>) || [];

    for (const change of changes) {
      if (change.field !== "feed") continue;

      const value = change.value as Record<string, unknown> | undefined;
      if (!value) continue;

      const message = (value.message as string) || "";
      const post_id = (value.post_id as string) || "";
      const from = value.from as Record<string, string> | undefined;
      const author_name = from?.name || "Unknown";
      const created_time = (value.created_time as string) || "";
      const group_id = (entry.id as string) || "";

      if (!post_id) continue;

      events.push({
        group_id,
        post_id,
        author_name,
        message,
        created_time,
      });
    }
  }

  return events;
}
