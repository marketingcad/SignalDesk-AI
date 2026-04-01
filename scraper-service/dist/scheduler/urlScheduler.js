"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initUrlScheduler = initUrlScheduler;
exports.shutdownUrlScheduler = shutdownUrlScheduler;
exports.listSchedules = listSchedules;
exports.getSchedule = getSchedule;
exports.createSchedule = createSchedule;
exports.updateSchedule = updateSchedule;
exports.deleteSchedule = deleteSchedule;
exports.pauseSchedule = pauseSchedule;
exports.resumeSchedule = resumeSchedule;
exports.runScheduleNow = runScheduleNow;
exports.runGroupNow = runGroupNow;
exports.clearRuns = clearRuns;
exports.listRuns = listRuns;
const cron = __importStar(require("node-cron"));
const crypto_1 = require("crypto");
const scrapers_1 = require("../scrapers");
const backendClient_1 = require("../api/backendClient");
const discord_1 = require("../alerts/discord");
const postFilter_1 = require("../utils/postFilter");
const rateLimiter_1 = require("../utils/rateLimiter");
const crawlerManager_1 = require("../crawler/crawlerManager");
const config_1 = require("../config");
const schedulePersistence_1 = require("../db/schedulePersistence");
// ---------------------------------------------------------------------------
// In-memory task map (standalone schedules)
// ---------------------------------------------------------------------------
const activeTasks = new Map();
// ---------------------------------------------------------------------------
// Group queue system — schedules sharing a base name + cron form a group
// and execute sequentially with rate-limit-aware delays.
// ---------------------------------------------------------------------------
/** Maps groupKey → cron task for that group */
const activeGroupTasks = new Map();
/** Maps groupKey → ordered list of schedule IDs in the group */
const groupMembers = new Map();
/** Prevents a group from overlapping with itself if the previous run is still going */
const runningGroups = new Set();
/**
 * Derive a group key from a schedule name. Schedules created with multiple
 * URLs get names like "My Schedule (#1)", "My Schedule (#2)", etc.
 * Returns `baseName||cronExpression` for grouped schedules, or null for standalone.
 */
function getGroupKey(schedule) {
    const match = schedule.name.match(/^(.+?)\s*\(#\d+\)$/);
    if (!match)
        return null;
    return `${match[1].trim()}||${schedule.cron}`;
}
// ---------------------------------------------------------------------------
// Concurrent execution lock — prevents overlapping runs for the same schedule
// ---------------------------------------------------------------------------
const runningSchedules = new Set();
// ---------------------------------------------------------------------------
// Session health tracking — consecutive zero-post runs per schedule
// ---------------------------------------------------------------------------
const consecutiveZeroPosts = new Map();
// ---------------------------------------------------------------------------
// Retry helper — retries a scrape with exponential backoff
// ---------------------------------------------------------------------------
async function scrapeWithRetry(url, tag) {
    const maxAttempts = config_1.config.scrapeRetryAttempts + 1; // 1 initial + N retries
    const baseDelay = config_1.config.scrapeRetryDelayMs;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await (0, scrapers_1.scrapeUrl)(url);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt < maxAttempts) {
                const delay = baseDelay * attempt; // linear backoff: 30s, 60s, ...
                console.log(`${tag} Attempt ${attempt}/${maxAttempts} failed: ${msg} — retrying in ${(delay / 1000).toFixed(0)}s...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            else {
                throw err; // exhausted retries
            }
        }
    }
    throw new Error("Unexpected: exhausted retries without throwing");
}
// ---------------------------------------------------------------------------
// Platform detection from URL (for rate limiting)
// ---------------------------------------------------------------------------
function detectPlatform(url) {
    if (/facebook\.com|fb\.com/i.test(url))
        return "Facebook";
    if (/linkedin\.com/i.test(url))
        return "LinkedIn";
    if (/reddit\.com/i.test(url))
        return "Reddit";
    if (/twitter\.com|x\.com/i.test(url))
        return "X";
    return "Other";
}
// ---------------------------------------------------------------------------
// Core runner — called by cron tick, group queue, or manual trigger
// ---------------------------------------------------------------------------
async function runSchedule(id) {
    const schedule = await (0, schedulePersistence_1.getScheduleById)(id);
    if (!schedule || schedule.status !== "active")
        return;
    // ── Concurrent execution lock ──────────────────────────────────────────
    if (runningSchedules.has(id)) {
        console.log(`[url-scheduler] "${schedule.name}" — skipped (already running)`);
        return;
    }
    if ((0, crawlerManager_1.isRunning)()) {
        console.log(`[url-scheduler] "${schedule.name}" — skipped (platform run in progress)`);
        return;
    }
    // ── Per-platform rate limiting (standalone schedules only) ─────────────
    // When called from runGroup(), the group runner already waited for
    // the rate limit to clear, so this check will pass.
    const platform = detectPlatform(schedule.url);
    const rateCheck = (0, rateLimiter_1.checkRateLimit)(platform);
    if (!rateCheck.allowed) {
        const waitSec = Math.ceil(rateCheck.retryAfterMs / 1000);
        console.log(`[url-scheduler] "${schedule.name}" — rate limited (${platform}), retry in ${waitSec}s`);
        return;
    }
    runningSchedules.add(id);
    (0, rateLimiter_1.recordScrapeStart)(platform);
    console.log(`[url-scheduler] Running "${schedule.name}" → ${schedule.url}`);
    // Create run record
    const runId = (0, crypto_1.randomUUID)();
    const run = {
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
    await (0, schedulePersistence_1.insertRun)(run);
    let runStatus = "ok";
    let postsFound = 0;
    let leadsInserted = 0;
    let errorMessage = null;
    try {
        const result = await scrapeWithRetry(schedule.url, `[url-scheduler] "${schedule.name}"`);
        const filtered = (0, postFilter_1.filterPosts)(result.posts, "[url-scheduler]");
        console.log(`[url-scheduler] ${filtered.length} posts after filtering (${result.posts.length - filtered.length} rejected)`);
        postsFound = filtered.length;
        if (filtered.length > 0) {
            const batchResult = await (0, backendClient_1.sendLeadsBatch)(filtered);
            if (batchResult) {
                leadsInserted = batchResult.inserted;
                await (0, discord_1.sendNewLeadsAlert)(schedule.url, result.platform, filtered, batchResult);
            }
        }
        if (result.errors.length > 0) {
            runStatus = "error";
            errorMessage = result.errors.join("; ");
            const discordErrors = result.errors.filter((e) => !e.includes("requires login") && !e.includes("page.goto: Timeout") && !e.includes("ERR_ABORTED"));
            if (discordErrors.length > 0) {
                await (0, discord_1.sendErrorAlert)(result.platform, discordErrors.join("\n"));
            }
        }
        // ── Session health monitoring ──────────────────────────────────────
        if (postsFound === 0 && runStatus === "ok") {
            const prev = consecutiveZeroPosts.get(id) ?? 0;
            const count = prev + 1;
            consecutiveZeroPosts.set(id, count);
            console.log(`[url-scheduler] "${schedule.name}" returned 0 posts (${count} consecutive)`);
            if (count >= config_1.config.sessionHealthThreshold) {
                await (0, discord_1.sendSessionHealthAlert)(schedule.name, schedule.url, platform, count);
            }
        }
        else {
            consecutiveZeroPosts.set(id, 0);
        }
    }
    catch (err) {
        runStatus = "error";
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[url-scheduler] "${schedule.name}" failed: ${errorMessage}`);
    }
    finally {
        runningSchedules.delete(id);
    }
    // Update run record
    await (0, schedulePersistence_1.patchRun)(runId, {
        finishedAt: new Date().toISOString(),
        status: runStatus,
        postsFound,
        leadsInserted,
        errorMessage,
    });
    // Persist run stats on schedule
    const now = new Date().toISOString();
    await (0, schedulePersistence_1.patchSchedule)(id, {
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
async function runGroup(groupKey) {
    if (runningGroups.has(groupKey)) {
        console.log(`[url-scheduler] Group "${groupKey.split("||")[0]}" — skipped (already running)`);
        return;
    }
    const memberIds = groupMembers.get(groupKey);
    if (!memberIds || memberIds.length === 0)
        return;
    const groupName = groupKey.split("||")[0];
    runningGroups.add(groupKey);
    console.log(`\n[url-scheduler] ═══ Group "${groupName}" triggered — ${memberIds.length} URL(s) to process ═══`);
    try {
        for (let i = 0; i < memberIds.length; i++) {
            const id = memberIds[i];
            const schedule = await (0, schedulePersistence_1.getScheduleById)(id);
            if (!schedule || schedule.status !== "active") {
                console.log(`[url-scheduler] Group [${i + 1}/${memberIds.length}] — skipped (inactive or deleted)`);
                continue;
            }
            // Wait for the platform rate limit to clear before running
            const platform = detectPlatform(schedule.url);
            const waitMs = (0, rateLimiter_1.getWaitTimeMs)(platform);
            if (waitMs > 0) {
                const waitSec = Math.ceil((waitMs + 1000) / 1000); // +1s buffer
                console.log(`[url-scheduler] Group [${i + 1}/${memberIds.length}] waiting ${waitSec}s for ${platform} rate limit before "${schedule.name}"`);
                await new Promise((resolve) => setTimeout(resolve, waitMs + 1000));
            }
            // Run the schedule — runSchedule handles its own error catching
            try {
                console.log(`[url-scheduler] Group [${i + 1}/${memberIds.length}] → "${schedule.name}"`);
                await runSchedule(id);
            }
            catch (err) {
                console.error(`[url-scheduler] Group member "${schedule.name}" failed:`, err);
                // Continue to next member — don't abort the group
            }
        }
    }
    finally {
        runningGroups.delete(groupKey);
        console.log(`[url-scheduler] ═══ Group "${groupName}" finished ═══\n`);
    }
}
// ---------------------------------------------------------------------------
// Task lifecycle — group-aware registration
// ---------------------------------------------------------------------------
function registerTask(schedule) {
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
        const members = groupMembers.get(groupKey);
        if (!members.includes(schedule.id)) {
            members.push(schedule.id);
        }
        // Register the group cron task if not already registered
        if (!activeGroupTasks.has(groupKey)) {
            const task = cron.schedule(schedule.cron, () => {
                runGroup(groupKey).catch((err) => console.error(`[url-scheduler] Group "${groupKey.split("||")[0]}" cron error:`, err));
            });
            activeGroupTasks.set(groupKey, task);
            console.log(`[url-scheduler] ✅ Group "${groupKey.split("||")[0]}" scheduled: ${schedule.cron} (${members.length} URL(s))`);
        }
        else {
            console.log(`[url-scheduler]    ↳ "${schedule.name}" added to group (${members.length} URL(s))`);
        }
        return true;
    }
    // ── Standalone schedule — individual cron task ──────────────────────
    unregisterTask(schedule.id);
    const task = cron.schedule(schedule.cron, () => {
        runSchedule(schedule.id).catch((err) => console.error(`[url-scheduler] "${schedule.name}" cron handler error:`, err));
    });
    activeTasks.set(schedule.id, task);
    console.log(`[url-scheduler] ✅ "${schedule.name}" scheduled: ${schedule.cron}`);
    return true;
}
function unregisterTask(id) {
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
async function initUrlScheduler() {
    const schedules = await (0, schedulePersistence_1.readSchedules)();
    const backend = (0, schedulePersistence_1.isUsingSupabase)() ? "Supabase" : "JSON files";
    console.log(`[url-scheduler] Loading ${schedules.length} URL schedule(s) from ${backend}...`);
    for (const s of schedules) {
        if (s.status === "active")
            registerTask(s);
    }
    // Log group summary
    if (groupMembers.size > 0) {
        console.log(`[url-scheduler] ${groupMembers.size} schedule group(s) detected:`);
        for (const [key, members] of groupMembers) {
            console.log(`[url-scheduler]   "${key.split("||")[0]}" — ${members.length} URL(s), cron: ${key.split("||")[1]}`);
        }
    }
}
function shutdownUrlScheduler() {
    for (const [id] of activeTasks) {
        const task = activeTasks.get(id);
        if (task)
            task.stop();
    }
    activeTasks.clear();
    for (const [, task] of activeGroupTasks)
        task.stop();
    activeGroupTasks.clear();
    groupMembers.clear();
    runningGroups.clear();
    console.log("[url-scheduler] All URL schedule jobs stopped");
}
// ---------------------------------------------------------------------------
// CRUD — called by route handlers (async)
// ---------------------------------------------------------------------------
async function listSchedules() {
    return (0, schedulePersistence_1.readSchedules)();
}
async function getSchedule(id) {
    return (0, schedulePersistence_1.getScheduleById)(id);
}
async function createSchedule(input) {
    const now = new Date().toISOString();
    const schedule = {
        id: (0, crypto_1.randomUUID)(),
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
    await (0, schedulePersistence_1.insertSchedule)(schedule);
    if (schedule.status === "active")
        registerTask(schedule);
    return schedule;
}
async function updateSchedule(id, patch) {
    const before = await (0, schedulePersistence_1.getScheduleById)(id);
    if (!before)
        return null;
    const updated = {
        ...before,
        ...patch,
        id: before.id,
        createdAt: before.createdAt,
        updatedAt: new Date().toISOString(),
    };
    await (0, schedulePersistence_1.patchSchedule)(id, {
        ...patch,
        updatedAt: updated.updatedAt,
    });
    // Re-register task if cron/url/name changed or status toggled
    const cronOrUrlChanged = (patch.cron !== undefined && patch.cron !== before.cron) ||
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
async function deleteSchedule(id) {
    const deleted = await (0, schedulePersistence_1.removeSchedule)(id);
    if (!deleted)
        return false;
    unregisterTask(id);
    consecutiveZeroPosts.delete(id);
    return true;
}
async function pauseSchedule(id) {
    return updateSchedule(id, { status: "paused" });
}
async function resumeSchedule(id) {
    return updateSchedule(id, { status: "active" });
}
/** Run a single schedule immediately (manual trigger). */
async function runScheduleNow(id) {
    const schedule = await (0, schedulePersistence_1.getScheduleById)(id);
    if (!schedule)
        throw new Error(`Schedule not found: ${id}`);
    await runSchedule(id);
}
/**
 * Run all members of a schedule's group sequentially.
 * If the schedule is not part of a group, runs it individually.
 */
async function runGroupNow(scheduleId) {
    const schedule = await (0, schedulePersistence_1.getScheduleById)(scheduleId);
    if (!schedule)
        throw new Error(`Schedule not found: ${scheduleId}`);
    const groupKey = getGroupKey(schedule);
    if (groupKey && groupMembers.has(groupKey)) {
        await runGroup(groupKey);
    }
    else {
        // Not a group member — run individually
        await runSchedule(scheduleId);
    }
}
// ---------------------------------------------------------------------------
// Run history queries — called by route handlers
// ---------------------------------------------------------------------------
async function clearRuns() {
    await (0, schedulePersistence_1.clearAllRuns)();
}
async function listRuns(scheduleId) {
    return (0, schedulePersistence_1.readRuns)(scheduleId);
}
//# sourceMappingURL=urlScheduler.js.map