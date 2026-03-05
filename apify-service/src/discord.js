import { config } from "./config.js";

const PLATFORM_EMOJI = {
  Facebook: "\u{1F4D8}",
  LinkedIn: "\u{1F4BC}",
  Reddit: "\u{1F7E0}",
  X: "\u{1D54F}",
};

/**
 * Send a summary digest to Discord after an Apify scrape run completes.
 * @param {{ platform: string, total: number, inserted: number, duplicates: number }[]} results
 */
export async function sendRunSummary(results) {
  const webhookUrl = config.discordWebhookUrl;
  if (!webhookUrl) return;

  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalDuplicates = results.reduce((sum, r) => sum + r.duplicates, 0);
  const totalScraped = results.reduce((sum, r) => sum + r.total, 0);

  if (totalScraped === 0) return;

  const platformLines = results
    .filter((r) => r.total > 0)
    .map((r) => {
      const emoji = PLATFORM_EMOJI[r.platform] || "\u{1F4CC}";
      return `${emoji} **${r.platform}**: ${r.total} scraped, ${r.inserted} new, ${r.duplicates} dupes`;
    })
    .join("\n");

  const embed = {
    title: `Apify Scrape Complete`,
    description: platformLines,
    color: totalInserted > 0 ? 0x22c55e : 0x71717a,
    fields: [
      { name: "Total Scraped", value: String(totalScraped), inline: true },
      { name: "New Leads", value: String(totalInserted), inline: true },
      { name: "Duplicates", value: String(totalDuplicates), inline: true },
    ],
    footer: { text: `SignalDesk AI Apify Service` },
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
