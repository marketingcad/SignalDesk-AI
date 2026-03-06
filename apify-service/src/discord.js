import { config } from "./config.js";

const PLATFORM_EMOJI = {
  Facebook: "📘",
  LinkedIn: "💼",
  Reddit: "🟠",
  X: "𝕏",
};

/**
 * Send a scrape cycle summary to Discord after Apify actors complete.
 * @param {{ platform: string, total: number, passed?: number, inserted: number, duplicates: number }[]} results
 */
export async function sendRunSummary(results) {
  const webhookUrl = config.discordWebhookUrl;
  if (!webhookUrl) return;

  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalDuplicates = results.reduce((sum, r) => sum + r.duplicates, 0);
  const totalScraped = results.reduce((sum, r) => sum + r.total, 0);
  const totalPassed = results.reduce((sum, r) => sum + (r.passed || 0), 0);

  if (totalScraped === 0) return;

  const platformLines = results
    .filter((r) => r.total > 0)
    .map((r) => {
      const emoji = PLATFORM_EMOJI[r.platform] || "📌";
      const passed = r.passed || 0;
      const rejected = r.total - passed;
      return `${emoji} **${r.platform}** — ${r.total} scraped → ${passed} passed → **${r.inserted} new** (${r.duplicates} dupes, ${rejected} filtered)`;
    })
    .join("\n");

  const statusIcon = totalInserted > 0 ? "🟢" : totalScraped > 0 ? "🟡" : "⚪";
  const color = totalInserted > 0 ? 0x22c55e : totalPassed > 0 ? 0xf59e0b : 0x71717a;

  const embed = {
    title: `${statusIcon} Apify Scrape Cycle Complete`,
    description: platformLines,
    color,
    fields: [
      { name: "📥 Scraped", value: `**${totalScraped}**`, inline: true },
      { name: "✅ Passed Filter", value: `**${totalPassed}**`, inline: true },
      { name: "💾 New Leads", value: `**${totalInserted}**`, inline: true },
      { name: "🔁 Duplicates", value: `**${totalDuplicates}**`, inline: true },
      { name: "🚫 Filtered Out", value: `**${totalScraped - totalPassed}**`, inline: true },
      { name: "📊 Pass Rate", value: totalScraped > 0 ? `**${Math.round((totalPassed / totalScraped) * 100)}%**` : "N/A", inline: true },
    ],
    footer: { text: "SignalDesk AI • Apify Service" },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "SignalDesk AI", embeds: [embed] }),
    });

    if (!res.ok) {
      console.error(`[discord] Summary failed: ${res.status}`);
    } else {
      console.log(`[discord] Run summary sent`);
    }
  } catch (err) {
    console.error("[discord] Error:", err.message);
  }
}
