// ─────────────────────────────────────────────────────────────────────────────
// Shared types, constants, and helpers for scrape-url
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export type UrlItemResult = {
  url: string;
  success: boolean;
  platform?: string | null;
  postsFound?: number;
  duration?: number;
  errors?: string[];
  batch?: { inserted: number; duplicates: number } | null;
  scrapedPosts?: { author: string; text: string; url: string; platform: string }[];
  error?: string;
};

export type MultiScrapeResponse = {
  success?: boolean;
  totalPostsFound?: number;
  totalInserted?: number;
  totalDuplicates?: number;
  items?: UrlItemResult[];
  error?: string;
};

export type HistoryEntry = {
  id?: string;
  url: string;
  platform?: string;
  postsFound: number;
  inserted: number;
  duplicates: number;
  timestamp: Date;
  error?: string;
};

export type UrlSchedule = {
  id: string;
  name: string;
  url: string;
  cron: string;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: "ok" | "error" | null;
  totalRuns: number;
};

export type RunScrapedPost = {
  author: string;
  text: string;
  url: string;
  platform: string;
  timestamp: string;
  matchedKeywords: string[];
};

export type ScheduleRun = {
  id: string;
  scheduleId: string;
  scheduleName?: string;
  startedAt: string;
  finishedAt: string | null;
  status: "ok" | "error" | "running";
  postsFound: number;
  leadsInserted: number;
  errorMessage: string | null;
  scrapedPosts?: RunScrapedPost[];
};

export type BookmarkEntry = {
  id: string;
  url: string;
  name: string;
  platform: string | null;
};

export type NewSchedState = {
  name: string;
  urls: string[];
  cron: string;
  customCron: string;
  customMode: "minutes" | "hours" | "daily" | "weekly" | "raw";
  customMinutes: string;
  customHours: string;
  customTime: string;
  customDays: number[];
  status: "active" | "paused";
};

export type EditSchedState = {
  id: string;
  name: string;
  urls: string[];
  cron: string;
  customCron: string;
  customMode: "minutes" | "hours" | "daily" | "weekly" | "raw";
  customMinutes: string;
  customHours: string;
  customTime: string;
  customDays: number[];
  status: "active" | "paused";
  _groupIds: string[];
};

// ── Constants ────────────────────────────────────────────────────────────────

export const PLATFORM_META: Record<
  string,
  { color: string; bg: string; border: string; dot: string; accent: string }
> = {
  Facebook: { color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    dot: "bg-blue-400",    accent: "border-l-blue-500" },
  LinkedIn: { color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20",     dot: "bg-sky-400",     accent: "border-l-sky-500" },
  Reddit:   { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  dot: "bg-orange-400",  accent: "border-l-orange-500" },
  X:        { color: "text-zinc-300",    bg: "bg-zinc-500/10",    border: "border-zinc-500/20",    dot: "bg-zinc-300",    accent: "border-l-zinc-500" },
  Other:    { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "bg-emerald-400", accent: "border-l-emerald-500" },
};

export const PLATFORM_EXAMPLES = [
  { name: "Facebook", tip: "Groups & pages with buying intent", examples: ["https://www.facebook.com/groups/123456/"] },
  { name: "LinkedIn", tip: "Professional hiring/outsourcing posts", examples: ["https://www.linkedin.com/posts/..."] },
  { name: "Reddit",   tip: "Subreddits about hiring or delegation", examples: ["https://www.reddit.com/r/entrepreneur/"] },
  { name: "X",        tip: "Profiles & tweets needing VAs", examples: ["https://x.com/username"] },
  { name: "Other",    tip: "Any website — blogs, forums, job boards", examples: ["https://example.com/jobs"] },
];

export const CRON_PRESETS = [
  { label: "Every 15 min",    short: "15m",   value: "*/15 * * * *",  intervalMs: 15 * 60 * 1000 },
  { label: "Every 30 min",    short: "30m",   value: "*/30 * * * *",  intervalMs: 30 * 60 * 1000 },
  { label: "Every hour",      short: "1h",    value: "0 * * * *",     intervalMs: 60 * 60 * 1000 },
  { label: "Every 2 hours",   short: "2h",    value: "0 */2 * * *",   intervalMs: 2 * 60 * 60 * 1000 },
  { label: "Every 6 hours",   short: "6h",    value: "0 */6 * * *",   intervalMs: 6 * 60 * 60 * 1000 },
  { label: "Every 12 hours",  short: "12h",   value: "0 */12 * * *",  intervalMs: 12 * 60 * 60 * 1000 },
  { label: "Daily at 9 am",   short: "9am",   value: "0 9 * * *",     intervalMs: 24 * 60 * 60 * 1000 },
  { label: "Custom cron",     short: "—",     value: "custom",        intervalMs: 0 },
];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DEFAULT_NEW_SCHED: NewSchedState = {
  name: "",
  urls: [""],
  cron: "*/30 * * * *",
  customCron: "",
  customMode: "minutes",
  customMinutes: "10",
  customHours: "3",
  customTime: "09:00",
  customDays: [1],
  status: "active",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function detectPlatform(url: string): string | null {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/x\.com|twitter\.com/i.test(url)) return "X";
  try { new URL(url); return "Other"; } catch { return null; }
}

export function cronLabel(expr: string): string {
  return CRON_PRESETS.find((p) => p.value === expr)?.label ?? expr;
}

export function cronIntervalMs(expr: string): number {
  const preset = CRON_PRESETS.find((p) => p.value === expr);
  if (preset) return preset.intervalMs;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 0;
  const [min, hour] = parts;
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === "*") return parseInt(minStep[1], 10) * 60 * 1000;
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (hourStep && (min === "0" || min === "00")) return parseInt(hourStep[1], 10) * 60 * 60 * 1000;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && parts[2] === "*") return 24 * 60 * 60 * 1000;
  return 0;
}

export function formatMs(ms: number): string {
  if (ms <= 0) return "any moment";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function buildCustomCron(
  mode: "minutes" | "hours" | "daily" | "weekly" | "raw",
  opts: { minutes?: string; hours?: string; time?: string; days?: number[]; raw?: string }
): string {
  const [h, m] = (opts.time ?? "09:00").split(":").map(Number);
  switch (mode) {
    case "minutes": {
      const n = parseInt(opts.minutes || "10", 10) || 10;
      return n === 1 ? "* * * * *" : `*/${n} * * * *`;
    }
    case "hours": {
      const n = parseInt(opts.hours || "3", 10) || 3;
      return n === 1 ? "0 * * * *" : `0 */${n} * * *`;
    }
    case "daily":   return `${m} ${h} * * *`;
    case "weekly": {
      const d = (opts.days ?? [1]).sort().join(",");
      return `${m} ${h} * * ${d}`;
    }
    case "raw":     return opts.raw?.trim() ?? "";
  }
}

export function formatTs(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return "Today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatHistoryTs(date: Date): string {
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Group history entries by date label (Today, Yesterday, or formatted date) */
export function groupByDate<T extends { timestamp: Date }>(entries: T[]): { label: string; items: T[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups = new Map<string, T[]>();
  const order: string[] = [];

  for (const entry of entries) {
    const d = new Date(entry.timestamp);
    const entryDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    let label: string;
    if (entryDate.getTime() === today.getTime()) {
      label = "Today";
    } else if (entryDate.getTime() === yesterday.getTime()) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(entry);
  }

  return order.map((label) => ({ label, items: groups.get(label)! }));
}

/** Export data as CSV download */
export async function exportToCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? "");
        return val.includes(",") || val.includes('"') || val.includes("\n")
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(",")
    ),
  ].join("\n");

  const { isTauri } = await import("@/lib/tauri");
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (filePath) {
      await writeTextFile(filePath, csvContent);
    }
  } else {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
