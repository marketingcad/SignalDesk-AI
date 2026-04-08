import * as cron from "node-cron";
import { config } from "../config";
import { runPlatform, runAllPlatforms, isRunning } from "../crawler/crawlerManager";
import { fetchKeywords } from "../api/backendClient";
import { validateAllCookies } from "../crawler/browserAuth";
import { sendAuthExpiredAlert } from "../alerts/discord";
import { reportValidationResult } from "../utils/sessionHealth";
import type { Platform } from "../types";

const activeTasks: cron.ScheduledTask[] = [];

function scheduleJob(
  platform: Platform,
  expression: string,
  label: string
): void {
  if (!cron.validate(expression)) {
    console.warn(`[scheduler] Invalid cron expression for ${platform}: "${expression}" — skipping`);
    return;
  }

  const task = cron.schedule(expression, async () => {
    if (isRunning()) {
      console.log(`[scheduler] ${platform} — skipped (another run in progress)`);
      return;
    }

    console.log(`[scheduler] ${platform} — triggered by cron (${expression})`);
    try {
      // Refresh keywords from /settings before each cron run
      await fetchKeywords(true).catch(() =>
        console.warn(`[scheduler] ${platform} — keyword refresh failed, using cached`)
      );
      await runPlatform(platform);
    } catch (err) {
      console.error(`[scheduler] ${platform} cron job failed:`, err);
    }
  });

  activeTasks.push(task);
  console.log(`[scheduler] ✅ ${label} scheduled: ${expression}`);
}

export function startScheduler(): void {
  console.log("\n[scheduler] ═══════════════════════════════════");
  console.log("[scheduler] Starting cron scheduler...");
  console.log("[scheduler] ═══════════════════════════════════\n");

  scheduleJob("Reddit", config.cron.reddit, "Reddit (subreddit search)");
  scheduleJob("X", config.cron.x, "X/Twitter (Google dork)");
  scheduleJob("LinkedIn", config.cron.linkedin, "LinkedIn (Google dork)");
  scheduleJob("Facebook", config.cron.facebook, "Facebook (Google dork)");

  // Full run every 6 hours (free-tier friendly)
  const fullRunTask = cron.schedule("0 */6 * * *", async () => {
    if (isRunning()) {
      console.log("[scheduler] Full run — skipped (another run in progress)");
      return;
    }
    console.log("[scheduler] Full scraper run — triggered by cron");
    try {
      // Refresh keywords from /settings before full run
      await fetchKeywords(true).catch(() =>
        console.warn("[scheduler] Full run — keyword refresh failed, using cached")
      );
      await runAllPlatforms();
    } catch (err) {
      console.error("[scheduler] Full run cron job failed:", err);
    }
  });
  activeTasks.push(fullRunTask);
  console.log("[scheduler] ✅ Full run scheduled: every 6 hours");

  // Cookie health check — validates Facebook/LinkedIn sessions every 4 hours
  const cookieCheckTask = cron.schedule("0 */4 * * *", async () => {
    console.log("[scheduler] Cookie health check — validating auth sessions...");
    try {
      const results = await validateAllCookies();
      const platformMap: Record<string, Platform> = {
        facebook: "Facebook",
        linkedin: "LinkedIn",
      };

      for (const [key, result] of Object.entries(results)) {
        const platform = platformMap[key];
        if (!platform) continue;

        if (result === "error") {
          // Transient error (network timeout, browser crash) — don't poison health state
          console.warn(`[scheduler] ${platform} cookies: validation error (skipping health update)`);
          continue;
        }

        reportValidationResult(platform, result);

        if (result === "expired" || result === "no_cookies") {
          console.warn(`[scheduler] ${platform} cookies: ${result} — sending alert`);
          await sendAuthExpiredAlert(
            platform,
            result === "no_cookies" ? "no_cookies" : "cookie_validation"
          );
        } else {
          console.log(`[scheduler] ${platform} cookies: ${result}`);
        }
      }
    } catch (err) {
      console.error("[scheduler] Cookie health check failed:", err);
    }
  });
  activeTasks.push(cookieCheckTask);
  console.log("[scheduler] ✅ Cookie health check scheduled: every 4 hours\n");
}

export function stopScheduler(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  console.log("[scheduler] All cron jobs stopped");
}
