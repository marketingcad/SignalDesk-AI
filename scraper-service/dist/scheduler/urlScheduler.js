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
exports.clearRuns = clearRuns;
exports.listRuns = listRuns;
const cron = __importStar(require("node-cron"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const scrapers_1 = require("../scrapers");
const backendClient_1 = require("../api/backendClient");
const discord_1 = require("../alerts/discord");
const postFilter_1 = require("../utils/postFilter");
const crawlerManager_1 = require("../crawler/crawlerManager");
// ---------------------------------------------------------------------------
// Persistence — JSON file store
// ---------------------------------------------------------------------------
const STORE_DIR = path.resolve(__dirname, "../../storage");
const STORE_FILE = path.join(STORE_DIR, "url-schedules.json");
const RUNS_FILE = path.join(STORE_DIR, "url-schedule-runs.json");
const MAX_RUNS = 200; // keep last N runs to avoid unbounded growth
function readStore() {
    try {
        if (!fs.existsSync(STORE_FILE))
            return [];
        return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
    }
    catch {
        return [];
    }
}
function writeStore(schedules) {
    if (!fs.existsSync(STORE_DIR))
        fs.mkdirSync(STORE_DIR, { recursive: true });
    const tmp = STORE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(schedules, null, 2), "utf-8");
    fs.renameSync(tmp, STORE_FILE);
}
// ---------------------------------------------------------------------------
// Run history persistence
// ---------------------------------------------------------------------------
function readRuns() {
    try {
        if (!fs.existsSync(RUNS_FILE))
            return [];
        return JSON.parse(fs.readFileSync(RUNS_FILE, "utf-8"));
    }
    catch {
        return [];
    }
}
function writeRuns(runs) {
    if (!fs.existsSync(STORE_DIR))
        fs.mkdirSync(STORE_DIR, { recursive: true });
    const trimmed = runs.slice(-MAX_RUNS);
    const tmp = RUNS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), "utf-8");
    fs.renameSync(tmp, RUNS_FILE);
}
function addRun(run) {
    const runs = readRuns();
    runs.push(run);
    writeRuns(runs);
}
function updateRun(runId, patch) {
    const runs = readRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx !== -1) {
        runs[idx] = { ...runs[idx], ...patch };
        writeRuns(runs);
    }
}
// ---------------------------------------------------------------------------
// In-memory task map
// ---------------------------------------------------------------------------
const activeTasks = new Map();
// ---------------------------------------------------------------------------
// Core runner — called by cron tick or manual trigger
// ---------------------------------------------------------------------------
async function runSchedule(id) {
    const schedules = readStore();
    const schedule = schedules.find((s) => s.id === id);
    if (!schedule || schedule.status !== "active")
        return;
    if ((0, crawlerManager_1.isRunning)()) {
        console.log(`[url-scheduler] "${schedule.name}" — skipped (platform run in progress)`);
        return;
    }
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
    addRun(run);
    let runStatus = "ok";
    let postsFound = 0;
    let leadsInserted = 0;
    let errorMessage = null;
    try {
        const result = await (0, scrapers_1.scrapeUrl)(schedule.url);
        // Pre-filter: reject job seekers (same as crawlerManager + url-scraper)
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
            const discordErrors = result.errors.filter((e) => !e.includes("requires login"));
            if (discordErrors.length > 0) {
                await (0, discord_1.sendErrorAlert)(result.platform, discordErrors.join("\n"));
            }
        }
    }
    catch (err) {
        runStatus = "error";
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[url-scheduler] "${schedule.name}" failed: ${errorMessage}`);
    }
    // Update run record
    updateRun(runId, {
        finishedAt: new Date().toISOString(),
        status: runStatus,
        postsFound,
        leadsInserted,
        errorMessage,
    });
    // Persist run stats on schedule
    const updated = readStore();
    const idx = updated.findIndex((s) => s.id === id);
    if (idx !== -1) {
        updated[idx].lastRunAt = new Date().toISOString();
        updated[idx].lastRunStatus = runStatus;
        updated[idx].totalRuns = (updated[idx].totalRuns ?? 0) + 1;
        updated[idx].updatedAt = new Date().toISOString();
        writeStore(updated);
    }
}
// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------
function registerTask(schedule) {
    if (!cron.validate(schedule.cron)) {
        console.warn(`[url-scheduler] Invalid cron for "${schedule.name}": ${schedule.cron}`);
        return false;
    }
    unregisterTask(schedule.id);
    const task = cron.schedule(schedule.cron, () => runSchedule(schedule.id));
    activeTasks.set(schedule.id, task);
    console.log(`[url-scheduler] ✅ "${schedule.name}" scheduled: ${schedule.cron}`);
    return true;
}
function unregisterTask(id) {
    const task = activeTasks.get(id);
    if (task) {
        task.stop();
        activeTasks.delete(id);
    }
}
// ---------------------------------------------------------------------------
// Init / shutdown (called from index.ts)
// ---------------------------------------------------------------------------
function initUrlScheduler() {
    const schedules = readStore();
    console.log(`[url-scheduler] Loading ${schedules.length} URL schedule(s)...`);
    for (const s of schedules) {
        if (s.status === "active")
            registerTask(s);
    }
}
function shutdownUrlScheduler() {
    for (const [id] of activeTasks)
        unregisterTask(id);
    console.log("[url-scheduler] All URL schedule jobs stopped");
}
// ---------------------------------------------------------------------------
// CRUD — called by route handlers
// ---------------------------------------------------------------------------
function listSchedules() {
    return readStore().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
function getSchedule(id) {
    return readStore().find((s) => s.id === id);
}
function createSchedule(input) {
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
    const schedules = readStore();
    schedules.push(schedule);
    writeStore(schedules);
    if (schedule.status === "active")
        registerTask(schedule);
    return schedule;
}
function updateSchedule(id, patch) {
    const schedules = readStore();
    const idx = schedules.findIndex((s) => s.id === id);
    if (idx === -1)
        return null;
    const before = schedules[idx];
    const updated = {
        ...before,
        ...patch,
        id: before.id,
        createdAt: before.createdAt,
        updatedAt: new Date().toISOString(),
    };
    schedules[idx] = updated;
    writeStore(schedules);
    // Re-register task if cron/url changed or status toggled
    const cronOrUrlChanged = (patch.cron !== undefined && patch.cron !== before.cron) ||
        (patch.url !== undefined && patch.url !== before.url);
    const statusChanged = patch.status !== undefined && patch.status !== before.status;
    if (cronOrUrlChanged || statusChanged) {
        if (updated.status === "active") {
            registerTask(updated);
        }
        else {
            unregisterTask(id);
        }
    }
    return updated;
}
function deleteSchedule(id) {
    const schedules = readStore();
    const idx = schedules.findIndex((s) => s.id === id);
    if (idx === -1)
        return false;
    schedules.splice(idx, 1);
    writeStore(schedules);
    unregisterTask(id);
    return true;
}
function pauseSchedule(id) {
    return updateSchedule(id, { status: "paused" });
}
function resumeSchedule(id) {
    return updateSchedule(id, { status: "active" });
}
async function runScheduleNow(id) {
    const schedule = getSchedule(id);
    if (!schedule)
        throw new Error(`Schedule not found: ${id}`);
    await runSchedule(id);
}
// ---------------------------------------------------------------------------
// Run history queries — called by route handlers
// ---------------------------------------------------------------------------
function clearRuns() {
    writeRuns([]);
}
function listRuns(scheduleId) {
    const runs = readRuns();
    const filtered = scheduleId
        ? runs.filter((r) => r.scheduleId === scheduleId)
        : runs;
    return filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
//# sourceMappingURL=urlScheduler.js.map