import axios from "axios";
import { config } from "../config";
import type { Platform, ScrapeResult } from "../types";

const PLATFORM_EMOJI: Record<Platform, string> = {
  Facebook: "📘",
  LinkedIn: "💼",
  Reddit: "🟠",
  X: "𝕏",
};

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
      const emoji = PLATFORM_EMOJI[r.platform] || "📌";
      const errorTag = r.errors.length > 0 ? ` (⚠️ ${r.errors.length} errors)` : "";
      return `${emoji} **${r.platform}**: ${r.posts.length} posts${errorTag}`;
    })
    .join("\n");

  const embed = {
    title: "🤖 SignalDesk Scraper Run Complete",
    description: platformLines,
    color: totalErrors > 0 ? 0xf59e0b : 0x22c55e,
    fields: [
      { name: "📋 Total Posts", value: `**${totalPosts}**`, inline: true },
      {
        name: "⏱️ Duration",
        value: `**${(totalDuration / 1000).toFixed(1)}s**`,
        inline: true,
      },
      {
        name: "⚠️ Errors",
        value: `**${totalErrors}**`,
        inline: true,
      },
    ],
    footer: { text: "SignalDesk AI • Playwright Scraper" },
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
          title: `❌ Scraper Error — ${platform}`,
          description: `\`\`\`${error.slice(0, 1000)}\`\`\``,
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch {
    // Swallow — don't let Discord errors crash the scraper
  }
}
