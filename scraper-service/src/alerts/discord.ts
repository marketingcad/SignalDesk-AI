import axios from "axios";
import { config } from "../config";
import type { Platform, ScrapeResult, ScrapedPost } from "../types";
import type { BatchResponse } from "../api/backendClient";

// ---------------------------------------------------------------------------
// Platform identity — color + icon shown in every embed
// ---------------------------------------------------------------------------

const PLATFORM_COLOR: Record<Platform, number> = {
  Facebook: 0x1877f2,
  LinkedIn: 0x0a66c2,
  Reddit: 0xff4500,
  X: 0x14171a,
  Other: 0x10b981,
};

const PLATFORM_ICON: Record<Platform, string> = {
  Reddit: "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png",
  Facebook: "https://www.facebook.com/favicon.ico",
  LinkedIn: "https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7ym1pttyabrktfx",
  X: "https://abs.twimg.com/favicons/twitter.3.ico",
  Other: "https://www.google.com/s2/favicons?sz=64&domain=example.com",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  Facebook: "Facebook",
  LinkedIn: "LinkedIn",
  Reddit: "Reddit",
  X: "X (Twitter)",
  Other: "Website",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** First non-empty line of a post, capped at 80 chars — used as embed title */
function postTitle(text: string): string {
  const first = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  return first.length > 80 ? first.slice(0, 79) + "…" : first;
}

/** Post body without the first line, trimmed, capped at 300 chars */
function postBody(text: string): string {
  const lines = text.split("\n");
  const body = lines.length > 1 ? lines.slice(1).join("\n").trim() : "";
  if (!body) return text.length > 300 ? text.slice(0, 299) + "…" : text;
  return body.length > 300 ? body.slice(0, 299) + "…" : body;
}

function platformAuthor(platform: Platform) {
  return {
    name: PLATFORM_LABEL[platform],
    icon_url: PLATFORM_ICON[platform],
  };
}

/**
 * Build the "Keywords" field value, safely under Discord's 1024-char field-value
 * limit. A post can match 30+ keywords; the full list overflows and Discord
 * rejects the whole message with a 400. Cap the chips and add a "+N more".
 */
function keywordsField(matched: string[]): string {
  if (!matched.length) return "";
  const MAX_CHIPS = 12;
  const shown = matched.slice(0, MAX_CHIPS);
  let value = shown.map((k) => `\`${k}\``).join("  ");
  const remaining = matched.length - shown.length;
  if (remaining > 0) value += `  +${remaining} more`;
  // Hard safety cap (Discord field value max is 1024 chars)
  if (value.length > 1024) value = value.slice(0, 1021) + "…";
  return value;
}

// ---------------------------------------------------------------------------
// sendRunSummary — fired once after a full scheduled run across all platforms
// ---------------------------------------------------------------------------

export async function sendRunSummary(results: ScrapeResult[]): Promise<void> {
  if (!config.discordWebhookUrl) {
    console.log("[discord] No webhook URL configured — skipping summary");
    return;
  }

  const totalPosts = results.reduce((sum, r) => sum + r.posts.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const platformLines = results
    .map((r) => {
      const errorTag = r.errors.length > 0 ? ` — ⚠️ ${r.errors.length} error${r.errors.length !== 1 ? "s" : ""}` : "";
      return `**${PLATFORM_LABEL[r.platform]}** · ${r.posts.length} lead${r.posts.length !== 1 ? "s" : ""}${errorTag}`;
    })
    .join("\n");

  const embed = {
    author: {
      name: "SignalDesk AI · Scheduled Scraper",
      icon_url: "https://cdn.discordapp.com/embed/avatars/0.png",
    },
    title: totalErrors > 0 ? "⚠️ Scraper Run Complete — with errors" : "✅ Scraper Run Complete",
    description: platformLines || "No platforms ran.",
    color: totalErrors > 0 ? 0xf59e0b : 0x22c55e,
    fields: [
      { name: "Total Leads", value: `**${totalPosts}**`, inline: true },
      { name: "Duration", value: `**${(totalDuration / 1000).toFixed(1)}s**`, inline: true },
      { name: "Errors", value: `**${totalErrors}**`, inline: true },
    ],
    footer: { text: "SignalDesk AI · Playwright Scraper" },
    timestamp: new Date().toISOString(),
  };

  try {
    await axios.post(config.discordWebhookUrl, {
      username: "SignalDesk Scraper",
      embeds: [embed],
    });
    console.log("[discord] Run summary sent");
  } catch (err) {
    console.error("[discord] Failed to send summary:", err);
  }
}

// ---------------------------------------------------------------------------
// sendNewLeadsAlert — fired immediately when new leads are inserted
// Works for both manual scrape-url and per-platform scheduled runs
// ---------------------------------------------------------------------------

export async function sendNewLeadsAlert(
  sourceUrl: string,
  platform: Platform,
  posts: ScrapedPost[],
  batch: BatchResponse
): Promise<void> {
  if (!config.discordWebhookUrl) return;
  if (batch.inserted === 0) return;

  // Identify which posts are NEW (not duplicates)
  const newUrls = new Set(
    batch.results
      .filter((r) => !r.duplicate && r.leadId)
      .map((r) => r.url)
  );
  const newPosts = posts.filter((p) => newUrls.has(p.url));
  // Show EVERY new lead — no cap. URL matching normally yields exactly the new
  // leads; if it fails, fall back to the first `inserted` scraped posts.
  const leadPosts = newPosts.length > 0 ? newPosts : posts.slice(0, batch.inserted);

  const color = PLATFORM_COLOR[platform];
  const isScheduled = sourceUrl.startsWith("scheduled:");
  const sourceLabel = isScheduled
    ? `Scheduled scan · ${PLATFORM_LABEL[platform]}`
    : sourceUrl.length > 80
    ? sourceUrl.slice(0, 79) + "…"
    : sourceUrl;
  const sourceLink = isScheduled ? null : sourceUrl;

  // ── Summary embed (same Reddit-preview structure) ──────────────────────────
  const summaryEmbed = {
    author: platformAuthor(platform),
    title: `${batch.inserted} New ${PLATFORM_LABEL[platform]} Lead${batch.inserted !== 1 ? "s" : ""} Found`,
    description: sourceLink
      ? `Scraped from [${sourceLabel}](${sourceLink})`
      : `Scraped via ${sourceLabel}`,
    color,
    fields: [
      { name: "New Leads", value: `**${batch.inserted}**`, inline: true },
      { name: "Duplicates", value: `**${batch.duplicates}**`, inline: true },
      { name: "Total Scraped", value: `**${batch.processed ?? posts.length}**`, inline: true },
    ],
    footer: { text: "SignalDesk AI · Scraper" },
    timestamp: new Date().toISOString(),
  };

  // ── Per-post embeds (Reddit-link-preview style) ────────────────────────────
  const postEmbeds: Record<string, unknown>[] = leadPosts.map((p) => {
    const batchResult = batch.results.find((r) => r.url === p.url);
    const keywords = keywordsField(batchResult?.matchedKeywords ?? []);
    const intent = batchResult?.intentLevel ?? "";
    // intent_score is already a 0–100 value from the backend — do NOT ×100.
    const score = batchResult?.intentScore != null
      ? ` (${Math.round(batchResult.intentScore)}%)`
      : "";

    const fields: Record<string, unknown>[] = [];
    if (keywords) fields.push({ name: "Keywords", value: keywords, inline: false });
    if (intent)   fields.push({ name: "Intent", value: `**${intent}**${score}`, inline: true });

    return {
      author: platformAuthor(platform),
      title: postTitle(p.text),
      url: p.url || undefined,
      description: postBody(p.text),
      color,
      fields,
      footer: { text: `Posted by ${p.author || "Unknown"} · SignalDesk AI` },
      timestamp: p.timestamp || new Date().toISOString(),
    };
  });

  // Discord caps each message at 10 embeds AND ~6000 total characters. Pack the
  // summary + every per-post embed into as many messages as needed so ALL leads
  // are shown (no "+N more" truncation).
  const sizeOf = (e: Record<string, unknown>): number => {
    let n = 0;
    const add = (s: unknown) => { if (typeof s === "string") n += s.length; };
    add(e.title);
    add(e.description);
    add((e.footer as { text?: string } | undefined)?.text);
    add((e.author as { name?: string } | undefined)?.name);
    for (const f of ((e.fields as Array<{ name?: string; value?: string }> | undefined) ?? [])) {
      add(f.name);
      add(f.value);
    }
    return n;
  };

  const MAX_EMBEDS = 10;
  const MAX_CHARS = 5800; // leave headroom under Discord's 6000 limit
  const messages: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];
  let currentChars = 0;
  for (const e of [summaryEmbed, ...postEmbeds]) {
    const s = sizeOf(e);
    if (current.length >= MAX_EMBEDS || (current.length > 0 && currentChars + s > MAX_CHARS)) {
      messages.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(e);
    currentChars += s;
  }
  if (current.length) messages.push(current);

  try {
    for (let i = 0; i < messages.length; i++) {
      await axios.post(config.discordWebhookUrl, {
        username: "SignalDesk Scraper",
        embeds: messages[i],
      });
      // Small gap between messages to stay under Discord's webhook rate limit.
      if (i < messages.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    console.log(
      `[discord] New leads alert sent: ${batch.inserted} ${platform} leads across ${messages.length} message(s)`
    );
  } catch (err) {
    console.error("[discord] Failed to send new leads alert:", err);
  }
}

// ---------------------------------------------------------------------------
// sendSessionHealthAlert — fired when consecutive runs return 0 posts
// ---------------------------------------------------------------------------

export async function sendSessionHealthAlert(
  scheduleName: string,
  scheduleUrl: string,
  platform: Platform,
  consecutiveZeroRuns: number
): Promise<void> {
  if (!config.discordWebhookUrl) return;

  try {
    await axios.post(config.discordWebhookUrl, {
      username: "SignalDesk Scraper",
      embeds: [
        {
          author: platformAuthor(platform),
          title: "⚠️ Session Health Warning",
          description: [
            `Schedule **"${scheduleName}"** has returned **0 posts** for **${consecutiveZeroRuns} consecutive runs**.`,
            "",
            `This usually means the ${PLATFORM_LABEL[platform]} session cookies have expired or the page requires re-authentication.`,
            "",
            `**URL:** ${scheduleUrl}`,
            "",
            "➡️ Try re-authenticating via **Settings → Browser Login** or check if the URL is still valid.",
          ].join("\n"),
          color: 0xf59e0b,
          footer: { text: "SignalDesk AI · Session Health Monitor" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    console.log(`[discord] Session health alert sent for "${scheduleName}"`);
  } catch {
    // Swallow — don't let Discord errors crash the scraper
  }
}
