import * as cron from "node-cron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { scrapeUrl } from "../scrapers";
import { sendLeadsBatch } from "../api/backendClient";
import { sendNewLeadsAlert, sendErrorAlert } from "../alerts/discord";
import { filterPosts } from "../utils/postFilter";
import { isRunning } from "../crawler/crawlerManager";
import type {
  UrlSchedule,
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleRun,
} from "../types";

// ---------------------------------------------------------------------------
// Persistence — JSON file store
// ---------------------------------------------------------------------------

const STORE_DIR = path.resolve(__dirname, "../../storage");
const STORE_FILE = path.join(STORE_DIR, "url-schedules.json");
const RUNS_FILE = path.join(STORE_DIR, "url-schedule-runs.json");
const MAX_RUNS = 200; // keep last N runs to avoid unbounded growth

function readStore(): UrlSchedule[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) as UrlSchedule[];
  } catch {
    return [];
  }
}

function writeStore(schedules: UrlSchedule[]): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(schedules, null, 2), "utf-8");
  fs.renameSync(tmp, STORE_FILE);
}

// ---------------------------------------------------------------------------
// Run history persistence
// ---------------------------------------------------------------------------

function readRuns(): ScheduleRun[] {
  try {
    if (!fs.existsSync(RUNS_FILE)) return [];
    return JSON.parse(fs.readFileSync(RUNS_FILE, "utf-8")) as ScheduleRun[];
  } catch {
    return [];
  }
}

function writeRuns(runs: ScheduleRun[]): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  const trimmed = runs.slice(-MAX_RUNS);
  const tmp = RUNS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), "utf-8");
  fs.renameSync(tmp, RUNS_FILE);
}

function addRun(run: ScheduleRun): void {
  const runs = readRuns();
  runs.push(run);
  writeRuns(runs);
}

function updateRun(runId: string, patch: Partial<ScheduleRun>): void {
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

const activeTasks = new Map<string, cron.ScheduledTask>();

// ---------------------------------------------------------------------------
// Core runner — called by cron tick or manual trigger
// ---------------------------------------------------------------------------

async function runSchedule(id: string): Promise<void> {
  const schedules = readStore();
  const schedule = schedules.find((s) => s.id === id);
  if (!schedule || schedule.status !== "active") return;

  if (isRunning()) {
    console.log(`[url-scheduler] "${schedule.name}" — skipped (platform run in progress)`);
    return;
  }

  console.log(`[url-scheduler] Running "${schedule.name}" → ${schedule.url}`);

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
  addRun(run);

  let runStatus: "ok" | "error" = "ok";
  let postsFound = 0;
  let leadsInserted = 0;
  let errorMessage: string | null = null;

  try {
    const result = await scrapeUrl(schedule.url);

    // Pre-filter: reject job seekers (same as crawlerManager + url-scraper)
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
      }
    }

    if (result.errors.length > 0) {
      runStatus = "error";
      errorMessage = result.errors.join("; ");
      const discordErrors = result.errors.filter((e) => !e.includes("requires login"));
      if (discordErrors.length > 0) {
        await sendErrorAlert(result.platform, discordErrors.join("\n"));
      }
    }
  } catch (err) {
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

function registerTask(schedule: UrlSchedule): boolean {
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

function unregisterTask(id: string): void {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Init / shutdown (called from index.ts)
// ---------------------------------------------------------------------------

export function initUrlScheduler(): void {
  const schedules = readStore();
  console.log(`[url-scheduler] Loading ${schedules.length} URL schedule(s)...`);
  for (const s of schedules) {
    if (s.status === "active") registerTask(s);
  }
}

export function shutdownUrlScheduler(): void {
  for (const [id] of activeTasks) unregisterTask(id);
  console.log("[url-scheduler] All URL schedule jobs stopped");
}

// ---------------------------------------------------------------------------
// CRUD — called by route handlers
// ---------------------------------------------------------------------------

export function listSchedules(): UrlSchedule[] {
  return readStore().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function getSchedule(id: string): UrlSchedule | undefined {
  return readStore().find((s) => s.id === id);
}

export function createSchedule(input: CreateScheduleInput): UrlSchedule {
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

  const schedules = readStore();
  schedules.push(schedule);
  writeStore(schedules);

  if (schedule.status === "active") registerTask(schedule);
  return schedule;
}

export function updateSchedule(
  id: string,
  patch: UpdateScheduleInput
): UrlSchedule | null {
  const schedules = readStore();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const before = schedules[idx];
  const updated: UrlSchedule = {
    ...before,
    ...patch,
    id: before.id,
    createdAt: before.createdAt,
    updatedAt: new Date().toISOString(),
  };
  schedules[idx] = updated;
  writeStore(schedules);

  // Re-register task if cron/url changed or status toggled
  const cronOrUrlChanged =
    (patch.cron !== undefined && patch.cron !== before.cron) ||
    (patch.url !== undefined && patch.url !== before.url);
  const statusChanged = patch.status !== undefined && patch.status !== before.status;

  if (cronOrUrlChanged || statusChanged) {
    if (updated.status === "active") {
      registerTask(updated);
    } else {
      unregisterTask(id);
    }
  }

  return updated;
}

export function deleteSchedule(id: string): boolean {
  const schedules = readStore();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  schedules.splice(idx, 1);
  writeStore(schedules);
  unregisterTask(id);
  return true;
}

export function pauseSchedule(id: string): UrlSchedule | null {
  return updateSchedule(id, { status: "paused" });
}

export function resumeSchedule(id: string): UrlSchedule | null {
  return updateSchedule(id, { status: "active" });
}

export async function runScheduleNow(id: string): Promise<void> {
  const schedule = getSchedule(id);
  if (!schedule) throw new Error(`Schedule not found: ${id}`);
  await runSchedule(id);
}

// ---------------------------------------------------------------------------
// Run history queries — called by route handlers
// ---------------------------------------------------------------------------

export function listRuns(scheduleId?: string): ScheduleRun[] {
  const runs = readRuns();
  const filtered = scheduleId
    ? runs.filter((r) => r.scheduleId === scheduleId)
    : runs;
  return filtered.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
