import * as fs from "fs";
import * as path from "path";
import { getSupabase } from "./supabase";
import type { UrlSchedule, ScheduleRun } from "../types";

// ---------------------------------------------------------------------------
// Abstract persistence for URL schedules & runs.
// Uses Supabase when configured, falls back to local JSON files.
// ---------------------------------------------------------------------------

const STORE_DIR = path.resolve(__dirname, "../../storage");
const STORE_FILE = path.join(STORE_DIR, "url-schedules.json");
const RUNS_FILE = path.join(STORE_DIR, "url-schedule-runs.json");
const MAX_RUNS_JSON = 200;

function useSupabase() {
  return getSupabase() !== null;
}

// ---------------------------------------------------------------------------
// JSON helpers (fallback)
// ---------------------------------------------------------------------------

function readJsonFile<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T[];
  } catch {
    return [];
  }
}

function writeJsonFile<T>(filePath: string, data: T[], maxItems?: number): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  const trimmed = maxItems ? data.slice(-maxItems) : data;
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Supabase ↔ App type mappers
// ---------------------------------------------------------------------------

interface SupabaseScheduleRow {
  id: string;
  name: string;
  url: string;
  cron: string;
  status: string;
  last_run_at: string | null;
  last_run_status: string | null;
  total_runs: number;
  created_at: string;
  updated_at: string;
}

interface SupabaseRunRow {
  id: string;
  schedule_id: string;
  schedule_name: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  posts_found: number;
  leads_inserted: number;
  error_message: string | null;
  scraped_posts: unknown[] | null;
}

function rowToSchedule(r: SupabaseScheduleRow): UrlSchedule {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    cron: r.cron,
    status: r.status as "active" | "paused",
    lastRunAt: r.last_run_at,
    lastRunStatus: r.last_run_status as "ok" | "error" | null,
    totalRuns: r.total_runs,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToRun(r: SupabaseRunRow): ScheduleRun {
  return {
    id: r.id,
    scheduleId: r.schedule_id,
    scheduleName: r.schedule_name ?? undefined,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status as "ok" | "error" | "running",
    postsFound: r.posts_found,
    leadsInserted: r.leads_inserted,
    errorMessage: r.error_message,
    scrapedPosts: Array.isArray(r.scraped_posts) ? (r.scraped_posts as ScheduleRun["scrapedPosts"]) : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════

export async function readSchedules(): Promise<UrlSchedule[]> {
  const sb = getSupabase();
  if (!sb) return readJsonFile<UrlSchedule>(STORE_FILE);

  const { data, error } = await sb
    .from("url_schedules")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[persistence] Failed to read schedules from Supabase:", error.message);
    return readJsonFile<UrlSchedule>(STORE_FILE); // fallback
  }

  return (data as SupabaseScheduleRow[]).map(rowToSchedule);
}

export async function writeSchedules(schedules: UrlSchedule[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    writeJsonFile(STORE_FILE, schedules);
    return;
  }

  // Upsert all — this replaces the entire store (used rarely, mainly for bulk ops)
  const rows = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    cron: s.cron,
    status: s.status,
    last_run_at: s.lastRunAt,
    last_run_status: s.lastRunStatus,
    total_runs: s.totalRuns,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }));

  const { error } = await sb
    .from("url_schedules")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("[persistence] Failed to write schedules to Supabase:", error.message);
    writeJsonFile(STORE_FILE, schedules); // fallback
  }
}

export async function insertSchedule(schedule: UrlSchedule): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const all = readJsonFile<UrlSchedule>(STORE_FILE);
    all.push(schedule);
    writeJsonFile(STORE_FILE, all);
    return;
  }

  const { error } = await sb.from("url_schedules").insert({
    id: schedule.id,
    name: schedule.name,
    url: schedule.url,
    cron: schedule.cron,
    status: schedule.status,
    last_run_at: schedule.lastRunAt,
    last_run_status: schedule.lastRunStatus,
    total_runs: schedule.totalRuns,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
  });

  if (error) {
    console.error("[persistence] Failed to insert schedule:", error.message);
  }
}

export async function patchSchedule(id: string, patch: Record<string, unknown>): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const all = readJsonFile<UrlSchedule>(STORE_FILE);
    const idx = all.findIndex((s) => s.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...patch } as UrlSchedule;
      writeJsonFile(STORE_FILE, all);
    }
    return;
  }

  // Map camelCase app fields to snake_case DB columns
  const dbPatch: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    name: "name",
    url: "url",
    cron: "cron",
    status: "status",
    lastRunAt: "last_run_at",
    lastRunStatus: "last_run_status",
    totalRuns: "total_runs",
    updatedAt: "updated_at",
  };

  for (const [key, value] of Object.entries(patch)) {
    const col = fieldMap[key];
    if (col) dbPatch[col] = value;
  }

  const { error } = await sb.from("url_schedules").update(dbPatch).eq("id", id);
  if (error) {
    console.error("[persistence] Failed to patch schedule:", error.message);
  }
}

export async function removeSchedule(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) {
    const all = readJsonFile<UrlSchedule>(STORE_FILE);
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    writeJsonFile(STORE_FILE, all);
    return true;
  }

  const { error } = await sb.from("url_schedules").delete().eq("id", id);
  if (error) {
    console.error("[persistence] Failed to delete schedule:", error.message);
    return false;
  }
  return true;
}

export async function getScheduleById(id: string): Promise<UrlSchedule | undefined> {
  const sb = getSupabase();
  if (!sb) {
    return readJsonFile<UrlSchedule>(STORE_FILE).find((s) => s.id === id);
  }

  const { data, error } = await sb
    .from("url_schedules")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return undefined;
  return rowToSchedule(data as SupabaseScheduleRow);
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNS
// ═══════════════════════════════════════════════════════════════════════════

export async function readRuns(scheduleId?: string): Promise<ScheduleRun[]> {
  const sb = getSupabase();
  if (!sb) {
    const all = readJsonFile<ScheduleRun>(RUNS_FILE);
    const filtered = scheduleId ? all.filter((r) => r.scheduleId === scheduleId) : all;
    return filtered.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  let query = sb
    .from("url_schedule_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(500);

  if (scheduleId) {
    query = query.eq("schedule_id", scheduleId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[persistence] Failed to read runs:", error.message);
    return [];
  }

  return (data as SupabaseRunRow[]).map(rowToRun);
}

export async function insertRun(run: ScheduleRun): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const all = readJsonFile<ScheduleRun>(RUNS_FILE);
    all.push(run);
    writeJsonFile(RUNS_FILE, all, MAX_RUNS_JSON);
    return;
  }

  const { error } = await sb.from("url_schedule_runs").insert({
    id: run.id,
    schedule_id: run.scheduleId,
    schedule_name: run.scheduleName ?? null,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    status: run.status,
    posts_found: run.postsFound,
    leads_inserted: run.leadsInserted,
    error_message: run.errorMessage,
    scraped_posts: run.scrapedPosts ?? null,
  });

  if (error) {
    console.error("[persistence] Failed to insert run:", error.message);
  }
}

export async function patchRun(runId: string, patch: Partial<ScheduleRun>): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const all = readJsonFile<ScheduleRun>(RUNS_FILE);
    const idx = all.findIndex((r) => r.id === runId);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...patch };
      writeJsonFile(RUNS_FILE, all, MAX_RUNS_JSON);
    }
    return;
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.finishedAt !== undefined) dbPatch.finished_at = patch.finishedAt;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.postsFound !== undefined) dbPatch.posts_found = patch.postsFound;
  if (patch.leadsInserted !== undefined) dbPatch.leads_inserted = patch.leadsInserted;
  if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
  if (patch.scrapedPosts !== undefined) dbPatch.scraped_posts = patch.scrapedPosts;

  const { error } = await sb.from("url_schedule_runs").update(dbPatch).eq("id", runId);
  if (error) {
    console.error("[persistence] Failed to patch run:", error.message);
  }
}

export async function clearAllRuns(): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    writeJsonFile(RUNS_FILE, []);
    return;
  }

  // Delete all runs (Supabase requires a filter — use gte on a date that covers all)
  const { error } = await sb
    .from("url_schedule_runs")
    .delete()
    .gte("started_at", "1970-01-01");

  if (error) {
    console.error("[persistence] Failed to clear runs:", error.message);
  }
}

/** Returns true if Supabase is being used for persistence. */
export function isUsingSupabase(): boolean {
  return useSupabase();
}
