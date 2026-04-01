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
exports.readSchedules = readSchedules;
exports.writeSchedules = writeSchedules;
exports.insertSchedule = insertSchedule;
exports.patchSchedule = patchSchedule;
exports.removeSchedule = removeSchedule;
exports.getScheduleById = getScheduleById;
exports.readRuns = readRuns;
exports.insertRun = insertRun;
exports.patchRun = patchRun;
exports.clearAllRuns = clearAllRuns;
exports.isUsingSupabase = isUsingSupabase;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const supabase_1 = require("./supabase");
// ---------------------------------------------------------------------------
// Abstract persistence for URL schedules & runs.
// Uses Supabase when configured, falls back to local JSON files.
// ---------------------------------------------------------------------------
const STORE_DIR = path.resolve(__dirname, "../../storage");
const STORE_FILE = path.join(STORE_DIR, "url-schedules.json");
const RUNS_FILE = path.join(STORE_DIR, "url-schedule-runs.json");
const MAX_RUNS_JSON = 200;
function useSupabase() {
    return (0, supabase_1.getSupabase)() !== null;
}
// ---------------------------------------------------------------------------
// JSON helpers (fallback)
// ---------------------------------------------------------------------------
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return [];
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
    catch {
        return [];
    }
}
function writeJsonFile(filePath, data, maxItems) {
    if (!fs.existsSync(STORE_DIR))
        fs.mkdirSync(STORE_DIR, { recursive: true });
    const trimmed = maxItems ? data.slice(-maxItems) : data;
    const tmp = filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
}
function rowToSchedule(r) {
    return {
        id: r.id,
        name: r.name,
        url: r.url,
        cron: r.cron,
        status: r.status,
        lastRunAt: r.last_run_at,
        lastRunStatus: r.last_run_status,
        totalRuns: r.total_runs,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
function rowToRun(r) {
    return {
        id: r.id,
        scheduleId: r.schedule_id,
        scheduleName: r.schedule_name ?? undefined,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        status: r.status,
        postsFound: r.posts_found,
        leadsInserted: r.leads_inserted,
        errorMessage: r.error_message,
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════
async function readSchedules() {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb)
        return readJsonFile(STORE_FILE);
    const { data, error } = await sb
        .from("url_schedules")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) {
        console.error("[persistence] Failed to read schedules from Supabase:", error.message);
        return readJsonFile(STORE_FILE); // fallback
    }
    return data.map(rowToSchedule);
}
async function writeSchedules(schedules) {
    const sb = (0, supabase_1.getSupabase)();
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
async function insertSchedule(schedule) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        const all = readJsonFile(STORE_FILE);
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
async function patchSchedule(id, patch) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        const all = readJsonFile(STORE_FILE);
        const idx = all.findIndex((s) => s.id === id);
        if (idx !== -1) {
            all[idx] = { ...all[idx], ...patch };
            writeJsonFile(STORE_FILE, all);
        }
        return;
    }
    // Map camelCase app fields to snake_case DB columns
    const dbPatch = {};
    const fieldMap = {
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
        if (col)
            dbPatch[col] = value;
    }
    const { error } = await sb.from("url_schedules").update(dbPatch).eq("id", id);
    if (error) {
        console.error("[persistence] Failed to patch schedule:", error.message);
    }
}
async function removeSchedule(id) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        const all = readJsonFile(STORE_FILE);
        const idx = all.findIndex((s) => s.id === id);
        if (idx === -1)
            return false;
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
async function getScheduleById(id) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        return readJsonFile(STORE_FILE).find((s) => s.id === id);
    }
    const { data, error } = await sb
        .from("url_schedules")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data)
        return undefined;
    return rowToSchedule(data);
}
// ═══════════════════════════════════════════════════════════════════════════
// RUNS
// ═══════════════════════════════════════════════════════════════════════════
async function readRuns(scheduleId) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        const all = readJsonFile(RUNS_FILE);
        const filtered = scheduleId ? all.filter((r) => r.scheduleId === scheduleId) : all;
        return filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
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
    return data.map(rowToRun);
}
async function insertRun(run) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        const all = readJsonFile(RUNS_FILE);
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
    });
    if (error) {
        console.error("[persistence] Failed to insert run:", error.message);
    }
}
async function patchRun(runId, patch) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb) {
        const all = readJsonFile(RUNS_FILE);
        const idx = all.findIndex((r) => r.id === runId);
        if (idx !== -1) {
            all[idx] = { ...all[idx], ...patch };
            writeJsonFile(RUNS_FILE, all, MAX_RUNS_JSON);
        }
        return;
    }
    const dbPatch = {};
    if (patch.finishedAt !== undefined)
        dbPatch.finished_at = patch.finishedAt;
    if (patch.status !== undefined)
        dbPatch.status = patch.status;
    if (patch.postsFound !== undefined)
        dbPatch.posts_found = patch.postsFound;
    if (patch.leadsInserted !== undefined)
        dbPatch.leads_inserted = patch.leadsInserted;
    if (patch.errorMessage !== undefined)
        dbPatch.error_message = patch.errorMessage;
    const { error } = await sb.from("url_schedule_runs").update(dbPatch).eq("id", runId);
    if (error) {
        console.error("[persistence] Failed to patch run:", error.message);
    }
}
async function clearAllRuns() {
    const sb = (0, supabase_1.getSupabase)();
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
function isUsingSupabase() {
    return useSupabase();
}
//# sourceMappingURL=schedulePersistence.js.map