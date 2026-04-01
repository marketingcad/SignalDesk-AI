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
  // Fallback: if URL matching fails, show first N posts up to inserted count
  const postsToShow = (newPosts.length > 0 ? newPosts : posts).slice(0, 5);
  const extra = batch.inserted - postsToShow.length;

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
  const postEmbeds: Record<string, unknown>[] = postsToShow.map((p) => {
    const batchResult = batch.results.find((r) => r.url === p.url);
    const keywords = (batchResult?.matchedKeywords ?? []).map((k) => `\`${k}\``).join("  ");
    const intent = batchResult?.intentLevel ?? "";
    const score = batchResult?.intentScore != null
      ? ` (${Math.round(batchResult.intentScore * 100)}%)`
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

  // ── Trailing "N more" embed ────────────────────────────────────────────────
  if (extra > 0) {
    postEmbeds.push({
      description: `_…and **${extra}** more new lead${extra !== 1 ? "s" : ""}. Open SignalDesk to view all._`,
      color: 0x334155,
      footer: { text: "SignalDesk AI · Scraper" },
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await axios.post(config.discordWebhookUrl, {
      username: "SignalDesk Scraper",
      embeds: [summaryEmbed, ...postEmbeds],
    });
    console.log(`[discord] New leads alert sent: ${batch.inserted} ${platform} leads`);
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

// ---------------------------------------------------------------------------
// sendErrorAlert — consistent structure, same author/footer pattern
// ---------------------------------------------------------------------------

export async function sendErrorAlert(
  platform: Platform,
  error: string
): Promise<void> {
  if (!config.discordWebhookUrl) return;

  try {
    await axios.post(config.discordWebhookUrl, {
      username: "SignalDesk Scraper",
      embeds: [
        {
          author: platformAuthor(platform),
          title: "Scraper Error",
          description: `\`\`\`\n${error.slice(0, 1000)}\n\`\`\``,
          color: 0xef4444,
          footer: { text: "SignalDesk AI · Scraper" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch {
    // Swallow — don't let Discord errors crash the scraper
  }
}
