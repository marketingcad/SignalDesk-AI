import * as cron from "node-cron";
import { config } from "../config";
import { runPlatform, runAllPlatforms, isRunning } from "../crawler/crawlerManager";
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

  // Full run every 2 hours
  const fullRunTask = cron.schedule("0 */2 * * *", async () => {
    console.log("[scheduler] Full scraper run — triggered by cron");
    await runAllPlatforms();
  });
  activeTasks.push(fullRunTask);
  console.log("[scheduler] ✅ Full run scheduled: every 2 hours\n");
}

export function stopScheduler(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  console.log("[scheduler] All cron jobs stopped");
}
