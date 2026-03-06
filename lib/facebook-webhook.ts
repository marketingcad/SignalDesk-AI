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

/** Extended payload from the Chrome extension pipeline with scoring details */
export interface DiscordLeadAlert {
  author_name: string;
  message: string;
  url: string;
  platform: string;
  source: string;
  score: number;
  level: string;
  category: string;
  matchedKeywords: string[];
  created_time: string;
}

const PLATFORM_EMOJI: Record<string, string> = {
  Facebook: "📘",
  LinkedIn: "💼",
  Reddit: "🟠",
  X: "𝕏",
};

const PLATFORM_COLOR: Record<string, number> = {
  Facebook: 0x1877f2,
  LinkedIn: 0x0a66c2,
  Reddit: 0xff4500,
  X: 0x000000,
};

const LEVEL_COLOR: Record<string, number> = {
  High: 0x22c55e,
  Medium: 0xf59e0b,
  Low: 0x71717a,
};

const LEVEL_EMOJI: Record<string, string> = {
  High: "🟢",
  Medium: "🟡",
  Low: "⚪",
};

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    return date.toLocaleString("en-US", {
      month: "short", day: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch {
    return ts;
  }
}

/**
 * Rich Discord embed notification for VA hiring leads.
 * Platform-aware styling with score visualization and structured fields.
 */
export async function sendDiscordLeadAlert(
  payload: DiscordLeadAlert
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_WEBHOOK_URL is not configured — skipping notification");
    return;
  }

  const platformEmoji = PLATFORM_EMOJI[payload.platform] || "📌";
  const levelEmoji = LEVEL_EMOJI[payload.level] || "⚪";
  const embedColor = payload.level === "High"
    ? LEVEL_COLOR.High
    : (PLATFORM_COLOR[payload.platform] || LEVEL_COLOR[payload.level] || 0x6366f1);

  // Truncate message smartly — break at sentence or word boundary
  let description = payload.message;
  if (description.length > 400) {
    description = description.slice(0, 400);
    const lastPeriod = description.lastIndexOf(".");
    const lastSpace = description.lastIndexOf(" ");
    if (lastPeriod > 300) description = description.slice(0, lastPeriod + 1);
    else if (lastSpace > 300) description = description.slice(0, lastSpace);
    description += "…";
  }

  const embed = {
    title: `${levelEmoji} New ${payload.level} Intent Lead Detected`,
    description: `> ${description.replace(/\n/g, "\n> ")}`,
    color: embedColor,
    fields: [
      {
        name: "👤 Author",
        value: payload.author_name || "Unknown",
        inline: true,
      },
      {
        name: "📊 Intent Score",
        value: `**${payload.score}**/100 (${payload.level})\n${scoreBar(payload.score)}`,
        inline: true,
      },
      {
        name: "🏷️ Category",
        value: payload.category || "General",
        inline: true,
      },
      {
        name: `${platformEmoji} Platform`,
        value: payload.platform,
        inline: true,
      },
      {
        name: "📍 Source",
        value: payload.source || "apify",
        inline: true,
      },
      {
        name: "🕒 Detected",
        value: formatTimestamp(payload.created_time),
        inline: true,
      },
      {
        name: "🔑 Matched Keywords",
        value: payload.matchedKeywords.length > 0
          ? payload.matchedKeywords.map((kw) => `\`${kw}\``).join("  ")
          : "_None_",
        inline: false,
      },
      {
        name: "🔗 Post Link",
        value: payload.url ? `**[View Original Post →](${payload.url})**` : "_No link available_",
        inline: false,
      },
    ],
    footer: {
      text: `SignalDesk AI • ${payload.platform} • ${payload.level} Intent`,
      icon_url: "https://cdn.discordapp.com/embed/avatars/0.png",
    },
    timestamp: new Date().toISOString(),
  };

  console.log(`[discord] Sending lead alert: @${payload.author_name} | ${payload.platform} | Score: ${payload.score} (${payload.level})`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "SignalDesk AI",
      embeds: [embed],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[discord] Alert failed: ${res.status} ${res.statusText} — ${errBody}`);
  } else {
    console.log(`[discord] Alert sent successfully (${res.status})`);
  }
}

/**
 * Legacy plain-text notification (used by Facebook webhook pipeline).
 */
export async function sendDiscordNotification(
  payload: DiscordPayload
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_WEBHOOK_URL is not configured — skipping notification");
    return;
  }

  const emoji = payload.type === "HIRING_VA" ? "🟢" : "🔵";
  const label =
    payload.type === "HIRING_VA" ? "HIRING VA" : "SEEKING WORK";

  const postLink = payload.post_id.startsWith("http")
    ? payload.post_id
    : `https://facebook.com/${payload.post_id}`;

  const content = [
    `${emoji} **NEW ${label} POST FOUND**`,
    "",
    `👤 **Author:** ${payload.author_name}`,
    `📌 **Message:** ${payload.message.slice(0, 500)}`,
    `🔗 **Link:** ${postLink}`,
    `🕒 **Time:** ${payload.created_time}`,
  ].join("\n");

  console.log(`[discord] Sending plain-text notification...`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    console.error(
      `[discord] Notification failed: ${res.status} ${res.statusText}`
    );
  } else {
    console.log(`[discord] Discord notification sent successfully (${res.status})`);
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
