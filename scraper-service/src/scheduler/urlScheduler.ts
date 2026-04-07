import * as cron from "node-cron";
import { randomUUID } from "crypto";
import { scrapeUrl, scrapeOneUrl, createBrowserContext } from "../scrapers";
import { sendLeadsBatch, fetchKeywords } from "../api/backendClient";
import { sendNewLeadsAlert, sendErrorAlert, sendSessionHealthAlert } from "../alerts/discord";
import { filterPosts } from "../utils/postFilter";
import { checkRateLimit, recordScrapeStart } from "../utils/rateLimiter";
import { isRunning } from "../crawler/crawlerManager";
import { config } from "../config";
import {
  readSchedules,
  insertSchedule as dbInsertSchedule,
  patchSchedule as dbPatchSchedule,
  removeSchedule as dbRemoveSchedule,
  getScheduleById as dbGetSchedule,
  insertRun as dbInsertRun,
  patchRun as dbPatchRun,
  readRuns as dbReadRuns,
  clearAllRuns as dbClearRuns,
  isUsingSupabase,
} from "../db/schedulePersistence";
import type {
  UrlSchedule,
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleRun,
  RunScrapedPost,
  Platform,
} from "../types";

// ---------------------------------------------------------------------------
// In-memory task map (standalone schedules)
// ---------------------------------------------------------------------------

const activeTasks = new Map<string, cron.ScheduledTask>();

// ---------------------------------------------------------------------------
// Group queue system — schedules sharing a base name + cron form a group
// and execute sequentially with rate-limit-aware delays.
// ---------------------------------------------------------------------------

/** Maps groupKey → cron task for that group */
const activeGroupTasks = new Map<string, cron.ScheduledTask>();

/** Maps groupKey → ordered list of schedule IDs in the group */
const groupMembers = new Map<string, string[]>();

/** Prevents a group from overlapping with itself if the previous run is still going */
const runningGroups = new Set<string>();

/**
 * Derive a group key from a schedule name. Schedules created with multiple
 * URLs get names like "My Schedule (#1)", "My Schedule (#2)", etc.
 * Returns `baseName||cronExpression` for grouped schedules, or null for standalone.
 */
function getGroupKey(schedule: UrlSchedule): string | null {
  const match = schedule.name.match(/^(.+?)\s*\(#\d+\)$/);
  if (!match) return null;
  return `${match[1].trim()}||${schedule.cron}`;
}

// ---------------------------------------------------------------------------
// Concurrent execution lock — prevents overlapping runs for the same schedule
// ---------------------------------------------------------------------------

const runningSchedules = new Set<string>();

// ---------------------------------------------------------------------------
// Session health tracking — consecutive zero-post runs per schedule
// ---------------------------------------------------------------------------

const consecutiveZeroPosts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Retry helper — retries a scrape with exponential backoff
// ---------------------------------------------------------------------------

async function scrapeWithRetry(url: string, tag: string) {
  const maxAttempts = config.scrapeRetryAttempts + 1; // 1 initial + N retries
  const baseDelay = config.scrapeRetryDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scrapeUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = baseDelay * attempt; // linear backoff: 30s, 60s, ...
        console.log(
          `${tag} Attempt ${attempt}/${maxAttempts} failed: ${msg} — retrying in ${(delay / 1000).toFixed(0)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err; // exhausted retries
      }
    }
  }

  throw new Error("Unexpected: exhausted retries without throwing");
}

// ---------------------------------------------------------------------------
// Platform detection from URL (for rate limiting)
// ---------------------------------------------------------------------------

function detectPlatform(url: string): Platform {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/twitter\.com|x\.com/i.test(url)) return "X";
  return "Other";
}

// ---------------------------------------------------------------------------
// Core runner — called by cron tick, group queue, or manual trigger
// ---------------------------------------------------------------------------

async function runSchedule(id: string): Promise<void> {
  const schedule = await dbGetSchedule(id);
  if (!schedule || schedule.status !== "active") return;

  // ── Concurrent execution lock ──────────────────────────────────────────
  if (runningSchedules.has(id)) {
    console.log(`[url-scheduler] "${schedule.name}" — skipped (already running)`);
    return;
  }

  if (isRunning()) {
    console.log(`[url-scheduler] "${schedule.name}" — skipped (platform run in progress)`);
    return;
  }

  // ── Per-platform rate limiting (standalone schedules only) ─────────────
  // When called from runGroup(), the group runner already waited for
  // the rate limit to clear, so this check will pass.
  const platform = detectPlatform(schedule.url);
  const rateCheck = checkRateLimit(platform);
  if (!rateCheck.allowed) {
    const waitSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    console.log(
      `[url-scheduler] "${schedule.name}" — rate limited (${platform}), retry in ${waitSec}s`
    );
    return;
  }

  runningSchedules.add(id);
  recordScrapeStart(platform);

  console.log(`[url-scheduler] Running "${schedule.name}" → ${schedule.url}`);

  // Refresh keywords from /settings before scraping
  await fetchKeywords(true).catch(() =>
    console.warn(`[url-scheduler] Keyword refresh failed for "${schedule.name}", using cached`)
  );

  // Create run record
  const runId = randomUUID();
  const run: ScheduleRun = {
    id: runId,
    scheduleId: id,
    scheduleName: schedule.name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    postsFound: 0,
    leadsInserted: 0,
    errorMessage: null,
  };
  await dbInsertRun(run);

  let runStatus: "ok" | "error" = "ok";
  let postsFound = 0;
  let leadsInserted = 0;
  let errorMessage: string | null = null;
  let runScrapedPosts: RunScrapedPost[] = [];

  try {
    const result = await scrapeWithRetry(schedule.url, `[url-scheduler] "${schedule.name}"`);

    const filtered = filterPosts(result.posts, "[url-scheduler]");
    console.log(
      `[url-scheduler] ${filtered.length} posts after filtering (${result.posts.length - filtered.length} rejected)`
    );
    postsFound = filtered.length;

    if (filtered.length > 0) {
      const batchResult = await sendLeadsBatch(filtered);
      if (batchResult) {
        leadsInserted = batchResult.inserted;
        await sendNewLeadsAlert(schedule.url, result.platform, filtered, batchResult);

        // Build per-post data with matched keywords from batch results
        const kwMap = new Map<string, string[]>();
        for (const r of batchResult.results) {
          if (r.url && r.matchedKeywords?.length) kwMap.set(r.url, r.matchedKeywords);
        }
        runScrapedPosts = filtered.map((p) => ({
          author: p.author,
          text: p.text.slice(0, 200),
          url: p.url,
          platform: p.platform,
          timestamp: p.timestamp,
          matchedKeywords: kwMap.get(p.url) ?? [],
        }));
      } else {
        runScrapedPosts = filtered.map((p) => ({
          author: p.author,
          text: p.text.slice(0, 200),
          url: p.url,
          platform: p.platform,
          timestamp: p.timestamp,
          matchedKeywords: [],
        }));
      }
    }

    if (result.errors.length > 0) {
      runStatus = "error";
      errorMessage = result.errors.join("; ");
      const discordErrors = result.errors.filter((e) => !e.includes("requires login") && !e.includes("page.goto: Timeout") && !e.includes("ERR_ABORTED"));
      if (discordErrors.length > 0) {
        await sendErrorAlert(result.platform, discordErrors.join("\n"));
      }
    }

    // ── Session health monitoring ──────────────────────────────────────
    if (postsFound === 0 && runStatus === "ok") {
      const prev = consecutiveZeroPosts.get(id) ?? 0;
      const count = prev + 1;
      consecutiveZeroPosts.set(id, count);
      console.log(
        `[url-scheduler] "${schedule.name}" returned 0 posts (${count} consecutive)`
      );
      if (count >= config.sessionHealthThreshold) {
        await sendSessionHealthAlert(schedule.name, schedule.url, platform, count);
      }
    } else {
      consecutiveZeroPosts.set(id, 0);
    }
  } catch (err) {
    runStatus = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[url-scheduler] "${schedule.name}" failed: ${errorMessage}`);
  } finally {
    runningSchedules.delete(id);
  }

  // Update run record
  await dbPatchRun(runId, {
    finishedAt: new Date().toISOString(),
    status: runStatus,
    postsFound,
    leadsInserted,
    errorMessage,
    scrapedPosts: runScrapedPosts.length > 0 ? runScrapedPosts : undefined,
  });

  // Persist run stats on schedule
  const now = new Date().toISOString();
  await dbPatchSchedule(id, {
    lastRunAt: now,
    lastRunStatus: runStatus,
    totalRuns: (schedule.totalRuns ?? 0) + 1,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Group queue runner — processes all members of a group sequentially,
// waiting for per-platform rate limits between each URL.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Progressive batch constants
// ---------------------------------------------------------------------------

const BATCH_INTER_URL_DELAY_MS = 3000;  // delay between URLs in same pass
const BATCH_MAX_PASSES = 3;             // max retry passes for failed URLs

async function runGroup(groupKey: string): Promise<void> {
  if (runningGroups.has(groupKey)) {
    console.log(`[url-scheduler] Group "${groupKey.split("||")[0]}" — skipped (already running)`);
    return;
  }

  const memberIds = groupMembers.get(groupKey);
  if (!memberIds || memberIds.length === 0) return;

  const groupName = groupKey.split("||")[0];
  runningGroups.add(groupKey);

  console.log(`\n[url-scheduler] ═══ Group "${groupName}" triggered — ${memberIds.length} URL(s) via progressive batch ═══`);

  // ── Collect active schedules ────────────────────────────────────────
  const activeSchedules: { id: string; schedule: UrlSchedule }[] = [];
  for (const id of memberIds) {
    const schedule = await dbGetSchedule(id);
    if (schedule && schedule.status === "active") {
      activeSchedules.push({ id, schedule });
    }
  }

  if (activeSchedules.length === 0) {
    runningGroups.delete(groupKey);
    console.log(`[url-scheduler] ═══ Group "${groupName}" — no active members ═══\n`);
    return;
  }

  // Refresh keywords before batch scraping
  await fetchKeywords(true).catch(() =>
    console.warn(`[url-scheduler] Keyword refresh failed for group "${groupName}", using cached`)
  );

  // ── Create per-URL run records (all start as "running") ─────────────
  const runMap = new Map<string, { runId: string; scheduleId: string; schedule: UrlSchedule }>();
  for (const { id, schedule } of activeSchedules) {
    const runId = randomUUID();
    const run: ScheduleRun = {
      id: runId,
      scheduleId: id,
      scheduleName: schedule.name,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      postsFound: 0,
      leadsInserted: 0,
      errorMessage: null,
    };
    await dbInsertRun(run);
    runMap.set(schedule.url, { runId, scheduleId: id, schedule });
  }

  // ── Open ONE browser for the entire group ───────────────────────────
  const allPosts: import("../types").ScrapedPost[] = [];
  let context: import("playwright").BrowserContext | null = null;
  let browser: import("playwright").Browser | null = null;

  try {
    const browserCtx = await createBrowserContext();
    context = browserCtx.context;
    browser = browserCtx.browser;

    console.log(`[url-scheduler] Browser launched — scraping ${activeSchedules.length} URLs`);

    // URLs still pending (starts with all, shrinks each pass)
    let pendingUrls = activeSchedules.map((s) => s.schedule.url);

    // ── Loop: scrape all pending → collect failures → retry ───────────
    for (let pass = 1; pass <= BATCH_MAX_PASSES; pass++) {
      if (pendingUrls.length === 0) break;

      const isRetryPass = pass > 1;
      const passLabel = isRetryPass
        ? `RETRY PASS ${pass}/${BATCH_MAX_PASSES}`
        : `PASS ${pass}/${BATCH_MAX_PASSES}`;

      console.log(`\n[url-scheduler] ── ${passLabel}: ${pendingUrls.length} URL(s) ──`);

      const failedThisPass: string[] = [];

      for (let i = 0; i < pendingUrls.length; i++) {
        const targetUrl = pendingUrls[i];
        const entry = runMap.get(targetUrl);
        if (!entry) continue;

        const label = `[${i + 1}/${pendingUrls.length}]`;

        // Delay between URLs (skip first in each pass)
        if (i > 0) {
          await new Promise((r) => setTimeout(r, BATCH_INTER_URL_DELAY_MS));
        }

        // Mark run as "running" (for retry passes, reset the status)
        if (isRetryPass) {
          await dbPatchRun(entry.runId, {
            status: "running",
            errorMessage: null,
          });
        }

        console.log(`[url-scheduler] ${passLabel} ${label} → "${entry.schedule.name}" (${targetUrl})`);

        // Scrape using shared browser context
        const result = await scrapeOneUrl(context, targetUrl, `[url-scheduler]`, label, groupName);

        if (result.urlResult.success) {
          // ── Success: collect posts, update run record ────────────
          allPosts.push(...result.posts);
          await dbPatchRun(entry.runId, {
            finishedAt: new Date().toISOString(),
            status: "ok",
            postsFound: result.posts.length,
            errorMessage: null,
            scrapedPosts: result.posts.slice(0, 50).map((p) => ({
              author: p.author,
              text: p.text.slice(0, 200),
              url: p.url,
              platform: p.platform,
              timestamp: p.timestamp,
              matchedKeywords: [],
            })),
          });
          console.log(`[url-scheduler] ${passLabel} ${label} ✅ ${result.posts.length} posts`);
        } else {
          // ── Failed: mark error, add to retry queue ──────────────
          const errMsg = result.urlResult.errors.join("; ");
          const retriesLeft = BATCH_MAX_PASSES - pass;
          await dbPatchRun(entry.runId, {
            status: "error",
            errorMessage: retriesLeft > 0
              ? `${errMsg} (will retry — ${retriesLeft} pass(es) left)`
              : errMsg,
            postsFound: 0,
          });
          failedThisPass.push(targetUrl);
          console.log(`[url-scheduler] ${passLabel} ${label} ❌ Failed: ${errMsg}${retriesLeft > 0 ? ` — will retry` : ` — giving up`}`);
        }
      }

      // Next pass only processes the failures from this pass
      pendingUrls = failedThisPass;

      if (failedThisPass.length > 0 && pass < BATCH_MAX_PASSES) {
        console.log(`[url-scheduler] ${failedThisPass.length} URL(s) failed — retrying in next pass...`);
        // Brief pause before retry pass
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[url-scheduler] Group "${groupName}" browser error: ${msg}`);
    // Mark any still-running records as error
    for (const [, entry] of runMap) {
      await dbPatchRun(entry.runId, {
        finishedAt: new Date().toISOString(),
        status: "error",
        errorMessage: `Browser crashed: ${msg}`,
      }).catch(() => {});
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  // ── Send ONE combined batch of all posts to backend ─────────────────
  const filtered = filterPosts(allPosts, `[url-scheduler] "${groupName}"`);
  console.log(
    `[url-scheduler] Group "${groupName}": ${filtered.length} posts after filtering (${allPosts.length - filtered.length} rejected)`
  );

  let leadsInserted = 0;
  if (filtered.length > 0) {
    const batchResponse = await sendLeadsBatch(filtered);
    if (batchResponse) {
      leadsInserted = batchResponse.inserted;

      // Get the dominant platform for the alert
      const platformCounts = new Map<Platform, number>();
      for (const p of filtered) {
        platformCounts.set(p.platform, (platformCounts.get(p.platform) || 0) + 1);
      }
      let alertPlatform: Platform = "Other";
      let maxCount = 0;
      for (const [plat, count] of platformCounts) {
        if (count > maxCount) { alertPlatform = plat; maxCount = count; }
      }
      await sendNewLeadsAlert(`${groupName} (${activeSchedules.length} URLs)`, alertPlatform, filtered, batchResponse);

      // Update per-URL run records with matched keywords from batch results
      const kwMap = new Map<string, string[]>();
      for (const r of batchResponse.results) {
        if (r.url && r.matchedKeywords?.length) kwMap.set(r.url, r.matchedKeywords);
      }
      // Update scrapedPosts on successful runs with keyword data
      for (const [url, entry] of runMap) {
        const postsForUrl = filtered.filter((p) =>
          p.source === groupName && (p.url === url || p.url.includes(url.replace(/https?:\/\//, "")))
        );
        if (postsForUrl.length > 0) {
          await dbPatchRun(entry.runId, {
            scrapedPosts: postsForUrl.slice(0, 50).map((p) => ({
              author: p.author,
              text: p.text.slice(0, 200),
              url: p.url,
              platform: p.platform,
              timestamp: p.timestamp,
              matchedKeywords: kwMap.get(p.url) ?? [],
            })),
          });
        }
      }
    }
  }

  // ── Update each schedule's metadata ─────────────────────────────────
  const now = new Date().toISOString();
  for (const { scheduleId } of runMap.values()) {
    const schedule = await dbGetSchedule(scheduleId);
    if (schedule) {
      await dbPatchSchedule(scheduleId, {
        lastRunAt: now,
        lastRunStatus: "ok",
        totalRuns: (schedule.totalRuns ?? 0) + 1,
        updatedAt: now,
      });
    }
  }

  // Mark any still-running records as finished (safety net)
  for (const [, entry] of runMap) {
    await dbPatchRun(entry.runId, {
      finishedAt: new Date().toISOString(),
    }).catch(() => {});
  }

  runningGroups.delete(groupKey);

  const successCount = [...runMap.values()].length;
  console.log(`[url-scheduler] ═══ Group "${groupName}" finished — ${filtered.length} posts, ${leadsInserted} leads, ${successCount} URLs ═══\n`);
}

// ---------------------------------------------------------------------------
// Task lifecycle — group-aware registration
// ---------------------------------------------------------------------------

function registerTask(schedule: UrlSchedule): boolean {
  if (!cron.validate(schedule.cron)) {
    console.warn(`[url-scheduler] Invalid cron for "${schedule.name}": ${schedule.cron}`);
    return false;
  }

  const groupKey = getGroupKey(schedule);

  if (groupKey) {
    // ── Grouped schedule — join or create a group ─────────────────────
    // Remove any standalone task for this ID
    const existingIndividual = activeTasks.get(schedule.id);
    if (existingIndividual) {
      existingIndividual.stop();
      activeTasks.delete(schedule.id);
    }

    // Add to group members (avoid duplicates)
    if (!groupMembers.has(groupKey)) {
      groupMembers.set(groupKey, []);
    }
    const members = groupMembers.get(groupKey)!;
    if (!members.includes(schedule.id)) {
      members.push(schedule.id);
    }

    // Register the group cron task if not already registered
    if (!activeGroupTasks.has(groupKey)) {
      const task = cron.schedule(schedule.cron, () => {
        runGroup(groupKey).catch((err) =>
          console.error(`[url-scheduler] Group "${groupKey.split("||")[0]}" cron error:`, err)
        );
      });
      activeGroupTasks.set(groupKey, task);
      console.log(`[url-scheduler] ✅ Group "${groupKey.split("||")[0]}" scheduled: ${schedule.cron} (${members.length} URL(s))`);
    } else {
      console.log(`[url-scheduler]    ↳ "${schedule.name}" added to group (${members.length} URL(s))`);
    }

    return true;
  }

  // ── Standalone schedule — individual cron task ──────────────────────
  unregisterTask(schedule.id);
  const task = cron.schedule(schedule.cron, () => {
    runSchedule(schedule.id).catch((err) =>
      console.error(`[url-scheduler] "${schedule.name}" cron handler error:`, err)
    );
  });
  activeTasks.set(schedule.id, task);
  console.log(`[url-scheduler] ✅ "${schedule.name}" scheduled: ${schedule.cron}`);
  return true;
}

function unregisterTask(id: string): void {
  // Remove standalone task
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }

  // Remove from any group
  for (const [groupKey, members] of groupMembers) {
    const idx = members.indexOf(id);
    if (idx !== -1) {
      members.splice(idx, 1);
      if (members.length === 0) {
        // Group is empty — stop and remove the group cron task
        const groupTask = activeGroupTasks.get(groupKey);
        if (groupTask) {
          groupTask.stop();
          activeGroupTasks.delete(groupKey);
        }
        groupMembers.delete(groupKey);
        console.log(`[url-scheduler] Group "${groupKey.split("||")[0]}" removed (no members left)`);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Init / shutdown (called from index.ts)
// ---------------------------------------------------------------------------

export async function initUrlScheduler(): Promise<void> {
  const schedules = await readSchedules();
  const backend = isUsingSupabase() ? "Supabase" : "JSON files";
  console.log(`[url-scheduler] Loading ${schedules.length} URL schedule(s) from ${backend}...`);
  for (const s of schedules) {
    if (s.status === "active") registerTask(s);
  }
  // Log group summary
  if (groupMembers.size > 0) {
    console.log(`[url-scheduler] ${groupMembers.size} schedule group(s) detected:`);
    for (const [key, members] of groupMembers) {
      console.log(`[url-scheduler]   "${key.split("||")[0]}" — ${members.length} URL(s), cron: ${key.split("||")[1]}`);
    }
  }
}

export function shutdownUrlScheduler(): void {
  for (const [id] of activeTasks) {
    const task = activeTasks.get(id);
    if (task) task.stop();
  }
  activeTasks.clear();
  for (const [, task] of activeGroupTasks) task.stop();
  activeGroupTasks.clear();
  groupMembers.clear();
  runningGroups.clear();
  console.log("[url-scheduler] All URL schedule jobs stopped");
}

// ---------------------------------------------------------------------------
// CRUD — called by route handlers (async)
// ---------------------------------------------------------------------------

export async function listSchedules(): Promise<UrlSchedule[]> {
  return readSchedules();
}

export async function getSchedule(id: string): Promise<UrlSchedule | undefined> {
  return dbGetSchedule(id);
}

export async function createSchedule(input: CreateScheduleInput): Promise<UrlSchedule> {
  const now = new Date().toISOString();
  const schedule: UrlSchedule = {
    id: randomUUID(),
    name: input.name.trim(),
    url: input.url.trim(),
    cron: input.cron.trim(),
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastRunStatus: null,
    totalRuns: 0,
  };

  await dbInsertSchedule(schedule);

  if (schedule.status === "active") registerTask(schedule);
  return schedule;
}

export async function updateSchedule(
  id: string,
  patch: UpdateScheduleInput
): Promise<UrlSchedule | null> {
  const before = await dbGetSchedule(id);
  if (!before) return null;

  const updated: UrlSchedule = {
    ...before,
    ...patch,
    id: before.id,
    createdAt: before.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await dbPatchSchedule(id, {
    ...patch,
    updatedAt: updated.updatedAt,
  });

  // Re-register task if cron/url/name changed or status toggled
  const cronOrUrlChanged =
    (patch.cron !== undefined && patch.cron !== before.cron) ||
    (patch.url !== undefined && patch.url !== before.url);
  const nameChanged = patch.name !== undefined && patch.name !== before.name;
  const statusChanged = patch.status !== undefined && patch.status !== before.status;

  if (cronOrUrlChanged || nameChanged || statusChanged) {
    // Unregister from old group/task first, then re-register
    unregisterTask(id);
    if (updated.status === "active") {
      registerTask(updated);
    }
  }

  return updated;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const deleted = await dbRemoveSchedule(id);
  if (!deleted) return false;
  unregisterTask(id);
  consecutiveZeroPosts.delete(id);
  return true;
}

export async function pauseSchedule(id: string): Promise<UrlSchedule | null> {
  return updateSchedule(id, { status: "paused" });
}

export async function resumeSchedule(id: string): Promise<UrlSchedule | null> {
  return updateSchedule(id, { status: "active" });
}

/** Run a single schedule immediately (manual trigger). */
export async function runScheduleNow(id: string): Promise<void> {
  const schedule = await dbGetSchedule(id);
  if (!schedule) throw new Error(`Schedule not found: ${id}`);
  await runSchedule(id);
}

/**
 * Run all members of a schedule's group sequentially.
 * If the schedule is not part of a group, runs it individually.
 */
export async function runGroupNow(scheduleId: string): Promise<void> {
  const schedule = await dbGetSchedule(scheduleId);
  if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`);

  const groupKey = getGroupKey(schedule);
  if (groupKey && groupMembers.has(groupKey)) {
    await runGroup(groupKey);
  } else {
    // Not a group member — run individually
    await runSchedule(scheduleId);
  }
}

// ---------------------------------------------------------------------------
// Run history queries — called by route handlers
// ---------------------------------------------------------------------------

export async function clearRuns(): Promise<void> {
  await dbClearRuns();
}

export async function listRuns(scheduleId?: string): Promise<ScheduleRun[]> {
  return dbReadRuns(scheduleId);
}
