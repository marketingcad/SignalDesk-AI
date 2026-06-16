import { sendDiscordLeadAlert, type DiscordLeadAlert } from "./facebook-webhook";

// ---------------------------------------------------------------------------
// Smart Alert Engine — batches, deduplicates, and rate-limits Discord alerts
// ---------------------------------------------------------------------------

interface AlertEngineConfig {
  /** Collect alerts for this many ms before sending (default: 60s) */
  batchWindowMs: number;
  /** Max Discord messages per hour (default: 10) */
  maxAlertsPerHour: number;
  /** Min ms between alert sends (default: 5 min) */
  cooldownMs: number;
  /** Skip if same author+platform alerted within this window (default: 2h) */
  dedupeWindowMs: number;
  /** Send digest instead of individual alerts if >= this many (default: 3) */
  digestThreshold: number;
}

const DEFAULT_CONFIG: AlertEngineConfig = {
  batchWindowMs: 60_000,
  maxAlertsPerHour: 10,
  cooldownMs: 300_000,
  dedupeWindowMs: 7_200_000,
  digestThreshold: 3,
};

const PLATFORM_EMOJI: Record<string, string> = {
  Facebook: "📘",
  LinkedIn: "💼",
  Reddit: "🟠",
  X: "𝕏",
};

const LEVEL_COLOR: Record<string, number> = {
  High: 0x22c55e,
  Medium: 0xf59e0b,
  Low: 0x71717a,
};

class AlertEngine {
  private pendingAlerts: DiscordLeadAlert[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private alertsSentThisHour = 0;
  private lastAlertTime = 0;
  private recentAlertKeys = new Map<string, number>();
  private config: AlertEngineConfig;

  constructor(config: Partial<AlertEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Reset hourly counter
    setInterval(() => {
      this.alertsSentThisHour = 0;
    }, 3_600_000);
  }

  /** Enqueue a High or Medium intent lead for smart alerting. */
  enqueue(lead: DiscordLeadAlert): void {
    // Dedup: skip if same author+platform alerted recently
    const key = `${lead.author_name}:${lead.platform}`;
    const lastSeen = this.recentAlertKeys.get(key);
    if (lastSeen && Date.now() - lastSeen < this.config.dedupeWindowMs) {
      console.log(`[AlertEngine] Skipping duplicate alert for ${key}`);
      return;
    }

    this.pendingAlerts.push(lead);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.config.batchWindowMs);
    }
  }

  /** Force immediate flush (e.g. for single-lead processing). */
  async flushNow(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingAlerts.length === 0) return;

    // Rate limit check
    if (this.alertsSentThisHour >= this.config.maxAlertsPerHour) {
      console.warn(
        `[AlertEngine] Hourly limit reached (${this.alertsSentThisHour}/${this.config.maxAlertsPerHour}) — deferring`
      );
      this.flushTimer = setTimeout(() => this.flush(), this.config.cooldownMs);
      return;
    }

    // Cooldown check
    const timeSinceLast = Date.now() - this.lastAlertTime;
    if (this.lastAlertTime > 0 && timeSinceLast < this.config.cooldownMs) {
      const remaining = this.config.cooldownMs - timeSinceLast;
      console.log(`[AlertEngine] Cooldown active — retrying in ${Math.round(remaining / 1000)}s`);
      this.flushTimer = setTimeout(() => this.flush(), remaining);
      return;
    }

    const batch = this.pendingAlerts.splice(0);

    // Sort by score descending
    batch.sort((a, b) => b.score - a.score);

    try {
      if (batch.length < this.config.digestThreshold) {
        // Individual alerts
        for (const lead of batch) {
          await sendDiscordLeadAlert(lead);
          this.markAlerted(lead);
        }
      } else {
        // Digest mode
        await this.sendDigest(batch);
        for (const lead of batch) this.markAlerted(lead);
      }

      this.alertsSentThisHour++;
      this.lastAlertTime = Date.now();

      console.log(
        `[AlertEngine] Sent ${batch.length} alert(s) (${this.alertsSentThisHour}/${this.config.maxAlertsPerHour} this hour)`
      );
    } catch (err) {
      console.error("[AlertEngine] Failed to send alerts:", err);
      // Re-enqueue failed alerts
      this.pendingAlerts.unshift(...batch);
      this.flushTimer = setTimeout(() => this.flush(), this.config.cooldownMs);
    }
  }

  private markAlerted(lead: DiscordLeadAlert): void {
    const key = `${lead.author_name}:${lead.platform}`;
    this.recentAlertKeys.set(key, Date.now());

    // Clean up old entries
    const now = Date.now();
    for (const [k, v] of this.recentAlertKeys) {
      if (now - v > this.config.dedupeWindowMs) {
        this.recentAlertKeys.delete(k);
      }
    }
  }

  private async sendDigest(leads: DiscordLeadAlert[]): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[AlertEngine] DISCORD_WEBHOOK_URL not configured — skipping digest");
      return;
    }

    const platformCounts = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.platform] = (acc[l.platform] || 0) + 1;
      return acc;
    }, {});

    const platformSummary = Object.entries(platformCounts)
      .map(([p, c]) => `${PLATFORM_EMOJI[p] || "📌"} **${p}**: ${c}`)
      .join("  •  ");

    // Build an entry for EVERY lead — no cap (the old slice(0, 8) hid leads).
    const entries = leads.map((lead, i) => {
      const emoji = PLATFORM_EMOJI[lead.platform] || "📌";
      const scoreIcon = lead.score >= 80 ? "🟢" : lead.score >= 50 ? "🟡" : "⚪";
      const preview = lead.message.slice(0, 80).replace(/\n/g, " ");
      return (
        `${scoreIcon} **${i + 1}.** ${emoji} **${lead.author_name}** — Score: **${lead.score}**\n` +
        `> ${preview}…\n` +
        `> [View Post →](${lead.url})`
      );
    });

    // Pack entries into description chunks under Discord's 4096-char limit.
    const DESC_LIMIT = 3800;
    const descChunks: string[] = [];
    let buf = "";
    for (const e of entries) {
      if (buf && buf.length + 2 + e.length > DESC_LIMIT) {
        descChunks.push(buf);
        buf = e;
      } else {
        buf = buf ? `${buf}\n\n${e}` : e;
      }
    }
    if (buf) descChunks.push(buf);
    if (descChunks.length === 0) descChunks.push("_No preview available._");

    const avgScore = Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length);
    const color = leads[0].score >= 80 ? LEVEL_COLOR.High : LEVEL_COLOR.Medium;

    // First embed carries the title + summary fields; continuation embeds hold
    // the rest of the list so every lead is shown (no truncation).
    const embeds: Record<string, unknown>[] = descChunks.map((desc, idx) =>
      idx === 0
        ? {
            title: `📊 SignalDesk Lead Digest — ${leads.length} Qualified Leads`,
            description: desc,
            color,
            fields: [
              { name: "📡 Platforms", value: platformSummary, inline: false },
              { name: "📈 Avg Score", value: `**${avgScore}**/100`, inline: true },
              { name: "🏆 Top Score", value: `**${leads[0].score}**/100`, inline: true },
              { name: "📋 Total Leads", value: `**${leads.length}**`, inline: true },
            ],
            footer: { text: "SignalDesk AI • Lead Digest" },
            timestamp: new Date().toISOString(),
          }
        : {
            description: desc,
            color,
            footer: { text: `SignalDesk AI • Lead Digest (${idx + 1}/${descChunks.length})` },
          }
    );

    // Discord caps each message at 10 embeds AND ~6000 chars — pack accordingly.
    const sizeOf = (e: Record<string, unknown>): number => {
      let n = 0;
      const add = (s: unknown) => { if (typeof s === "string") n += s.length; };
      add(e.title);
      add(e.description);
      add((e.footer as { text?: string } | undefined)?.text);
      for (const f of ((e.fields as Array<{ name?: string; value?: string }> | undefined) ?? [])) {
        add(f.name);
        add(f.value);
      }
      return n;
    };
    const MAX_EMBEDS = 10;
    const MAX_CHARS = 5800;
    const messages: Record<string, unknown>[][] = [];
    let cur: Record<string, unknown>[] = [];
    let curChars = 0;
    for (const e of embeds) {
      const s = sizeOf(e);
      if (cur.length >= MAX_EMBEDS || (cur.length > 0 && curChars + s > MAX_CHARS)) {
        messages.push(cur);
        cur = [];
        curChars = 0;
      }
      cur.push(e);
      curChars += s;
    }
    if (cur.length) messages.push(cur);

    for (let i = 0; i < messages.length; i++) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "SignalDesk AI", embeds: messages[i] }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[AlertEngine] Digest failed: ${res.status} — ${errBody}`);
        throw new Error(`Discord digest failed: ${res.status}`);
      }
      // Small gap between messages to stay under Discord's webhook rate limit.
      if (i < messages.length - 1) await new Promise((r) => setTimeout(r, 700));
    }

    console.log(`[AlertEngine] Digest sent with ${leads.length} leads across ${messages.length} message(s)`);
  }
}

// Singleton — shared across API routes within the same server process
export const alertEngine = new AlertEngine();
