"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Globe,
  Link2,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  User,
  ArrowRight,
  FileSearch,
  Layers,
  Clock,
  Sparkles,
  ChevronRight,
  Hash,
  Plus,
  Trash2,
  Play,
  Pause,
  Calendar,
  RefreshCw,
  Timer,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  Activity,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UrlItemResult = {
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

type MultiScrapeResponse = {
  success?: boolean;
  totalPostsFound?: number;
  totalInserted?: number;
  totalDuplicates?: number;
  items?: UrlItemResult[];
  error?: string;
};

type HistoryEntry = {
  id?: string;
  url: string;
  platform?: string;
  postsFound: number;
  inserted: number;
  duplicates: number;
  timestamp: Date;
  error?: string;
};

type UrlSchedule = {
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

type ScheduleRun = {
  id: string;
  scheduleId: string;
  scheduleName?: string;
  startedAt: string;
  finishedAt: string | null;
  status: "ok" | "error" | "running";
  postsFound: number;
  leadsInserted: number;
  errorMessage: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { color: string; bg: string; border: string; dot: string; accent: string }> = {
  Facebook: { color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   dot: "bg-blue-400",   accent: "border-l-blue-500" },
  LinkedIn: { color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/20",    dot: "bg-sky-400",    accent: "border-l-sky-500" },
  Reddit:   { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-400", accent: "border-l-orange-500" },
  X:        { color: "text-zinc-300",   bg: "bg-zinc-500/10",   border: "border-zinc-500/20",   dot: "bg-zinc-300",   accent: "border-l-zinc-500" },
  Other:    { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "bg-emerald-400", accent: "border-l-emerald-500" },
};

const PLATFORM_EXAMPLES = [
  { name: "Facebook", tip: "Groups & pages with buying intent", examples: ["https://www.facebook.com/groups/123456/"] },
  { name: "LinkedIn", tip: "Professional hiring/outsourcing posts", examples: ["https://www.linkedin.com/posts/..."] },
  { name: "Reddit",   tip: "Subreddits about hiring or delegation", examples: ["https://www.reddit.com/r/entrepreneur/"] },
  { name: "X",        tip: "Profiles & tweets needing VAs", examples: ["https://x.com/username"] },
  { name: "Other",    tip: "Any website — blogs, forums, job boards", examples: ["https://example.com/jobs"] },
];

const CRON_PRESETS = [
  { label: "Every 15 min",    short: "15m",   value: "*/15 * * * *",  intervalMs: 15 * 60 * 1000 },
  { label: "Every 30 min",    short: "30m",   value: "*/30 * * * *",  intervalMs: 30 * 60 * 1000 },
  { label: "Every hour",      short: "1h",    value: "0 * * * *",     intervalMs: 60 * 60 * 1000 },
  { label: "Every 2 hours",   short: "2h",    value: "0 */2 * * *",   intervalMs: 2 * 60 * 60 * 1000 },
  { label: "Every 6 hours",   short: "6h",    value: "0 */6 * * *",   intervalMs: 6 * 60 * 60 * 1000 },
  { label: "Every 12 hours",  short: "12h",   value: "0 */12 * * *",  intervalMs: 12 * 60 * 60 * 1000 },
  { label: "Daily at 9 am",   short: "9am",   value: "0 9 * * *",     intervalMs: 24 * 60 * 60 * 1000 },
  { label: "Custom cron",     short: "—",     value: "custom",        intervalMs: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectPlatform(url: string): string | null {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/x\.com|twitter\.com/i.test(url)) return "X";
  // Any valid URL is supported via generic extraction
  try { new URL(url); return "Other"; } catch { return null; }
}

function cronLabel(expr: string): string {
  return CRON_PRESETS.find((p) => p.value === expr)?.label ?? expr;
}

function cronIntervalMs(expr: string): number {
  const preset = CRON_PRESETS.find((p) => p.value === expr);
  if (preset) return preset.intervalMs;
  // Parse common cron patterns: */N for minutes/hours
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 0;
  const [min, hour] = parts;
  // */N * * * * → every N minutes
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === "*") return parseInt(minStep[1], 10) * 60 * 1000;
  // 0 */N * * * → every N hours
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (hourStep && (min === "0" || min === "00")) return parseInt(hourStep[1], 10) * 60 * 60 * 1000;
  // 0 N * * * → daily at hour N (24h interval)
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && parts[2] === "*") return 24 * 60 * 60 * 1000;
  return 0;
}

function formatMs(ms: number): string {
  if (ms <= 0) return "any moment";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatTs(iso: string): string {
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

function formatHistoryTs(date: Date): string {
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─────────────────────────────────────────────────────────────────────────────
// PlatformBadge
// ─────────────────────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string | null }) {
  const meta = platform ? PLATFORM_META[platform] : null;
  if (!meta || !platform) return null;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0",
      meta.bg, meta.border, meta.color
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {platform}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UrlResultRow  (Scrape Now tab)
// ─────────────────────────────────────────────────────────────────────────────

function UrlResultRow({ item, index }: { item: UrlItemResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !item.success || !!item.error;
  const posts = item.scrapedPosts ?? [];

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      hasError ? "border-rose-500/20 bg-rose-500/5" : "border-border bg-card"
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">{index + 1}</span>
        {hasError
          ? <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
        <span className="flex-1 text-xs text-muted-foreground truncate font-mono" title={item.url}>{item.url}</span>
        <PlatformBadge platform={item.platform ?? null} />
        {!hasError && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-foreground font-medium">{item.postsFound ?? 0} posts</span>
            <span className="text-xs text-emerald-400 font-semibold">+{item.batch?.inserted ?? 0} leads</span>
            {(item.batch?.duplicates ?? 0) > 0 &&
              <span className="text-xs text-muted-foreground">{item.batch?.duplicates} dupes</span>}
          </div>
        )}
        {hasError && (
          <span className="text-xs text-rose-400 truncate max-w-[200px]">
            {item.error ?? item.errors?.[0] ?? "Failed"}
          </span>
        )}
        {posts.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {expanded && posts.length > 0 && (
        <div className="border-t border-border divide-y divide-border bg-muted/20">
          {posts.map((post, pi) => (
            <div key={pi} className="px-4 py-2.5 flex items-start gap-3">
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-5 text-right pt-0.5">{pi + 1}.</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-semibold text-foreground">{post.author}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{post.text}</p>
                {post.url && (
                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <ExternalLink className="h-2.5 w-2.5" />
                    <span className="truncate max-w-xs">{post.url}</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleTableRow  (Schedules tab — table row design)
// ─────────────────────────────────────────────────────────────────────────────

function ScheduleTableRow({
  schedule,
  onViewRuns,
  runningId,
  onRunNow,
  onPause,
  onResume,
  onDelete,
}: {
  schedule: UrlSchedule;
  onViewRuns: (id: string) => void;
  runningId: string | null;
  onRunNow?: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const isRunning = runningId === schedule.id;
  const platform = detectPlatform(schedule.url);
  const intervalMs = cronIntervalMs(schedule.cron);

  useEffect(() => {
    const baseTime = schedule.lastRunAt ?? schedule.createdAt;
    if (schedule.status !== "active" || !baseTime || !intervalMs) {
      setMsLeft(null);
      return;
    }
    const compute = () => {
      const next = new Date(baseTime).getTime() + intervalMs;
      setMsLeft(Math.max(0, next - Date.now()));
    };
    compute();
    const t = setInterval(compute, 1000);
    return () => clearInterval(t);
  }, [schedule.lastRunAt, schedule.createdAt, schedule.status, intervalMs]);

  const progress =
    msLeft !== null && intervalMs > 0
      ? Math.min(100, Math.round(((intervalMs - msLeft) / intervalMs) * 100))
      : null;

  return (
    <div className={cn(
      "group grid items-start gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
      onRunNow ? "grid-cols-[1fr_116px_76px_108px_56px_96px]" : "grid-cols-[1fr_116px_76px_108px_56px]"
    )}>

      {/* Col 1 — Name + URL + progress bar */}
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <PlatformBadge platform={platform} />
          <span className="text-sm font-semibold text-foreground leading-tight truncate max-w-65">
            {schedule.name}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono truncate" title={schedule.url}>
          {schedule.url}
        </p>
        {/* Progress bar */}
        {schedule.status === "active" && progress !== null && (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-1 rounded-full bg-muted/80 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  isRunning ? "animate-pulse bg-primary w-full" : "bg-emerald-500"
                )}
                style={{ width: isRunning ? "100%" : `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Col 2 — Frequency */}
      <div className="flex items-start pt-0.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border px-2 py-1 text-[11px] font-mono text-foreground whitespace-nowrap">
          <Timer className="h-3 w-3 text-muted-foreground shrink-0" />
          {cronLabel(schedule.cron)}
        </span>
      </div>

      {/* Col 3 — Status */}
      <div className="flex items-start pt-0.5">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 rounded-full h-5 whitespace-nowrap",
            schedule.status === "active"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-border bg-muted/30 text-muted-foreground"
          )}
        >
          <span className={cn(
            "mr-1 h-1.5 w-1.5 rounded-full inline-block shrink-0",
            schedule.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
          )} />
          {schedule.status === "active" ? "Active" : "Paused"}
        </Badge>
      </div>

      {/* Col 4 — Next run */}
      <div className="flex items-start pt-0.5">
        {isRunning ? (
          <span className="text-[11px] text-primary font-medium flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Running…
          </span>
        ) : schedule.status === "paused" ? (
          <span className="text-[11px] text-muted-foreground/50 italic">Paused</span>
        ) : msLeft !== null ? (
          <span className="text-[11px] text-emerald-400 font-medium">
            in {formatMs(msLeft)}
          </span>
        ) : schedule.status === "active" ? (
          <span className="text-[11px] text-muted-foreground">Scheduled</span>
        ) : null}
      </div>

      {/* Col 5 — Runs count + view */}
      <div className="flex items-start justify-end pt-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-1.5 text-muted-foreground hover:text-primary"
                onClick={() => onViewRuns(schedule.id)}>
                <Activity className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{schedule.totalRuns}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View {schedule.totalRuns} run{schedule.totalRuns !== 1 ? "s" : ""}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Col 6 — Actions (Run tab) */}
      {onRunNow && (
        <div className="flex items-start justify-end gap-0 pt-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                  onClick={() => onRunNow(schedule.id)} disabled={isRunning}>
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run now</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                {schedule.status === "active" ? (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400"
                    onClick={() => onPause?.(schedule.id)}>
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-400"
                    onClick={() => onResume?.(schedule.id)}>
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>{schedule.status === "active" ? "Pause" : "Resume"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                  onClick={() => onDelete?.(schedule.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ScrapeUrlPage() {
  const [activeTab, setActiveTab] = useState<"scrape" | "schedules" | "runs">("scrape");

  // ── Scrape Now ───────────────────────────────────────────
  const [urls, setUrls] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UrlItemResult[]>([]);
  const [totals, setTotals] = useState<{ inserted: number; found: number; dupes: number } | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Schedules ────────────────────────────────────────────
  const [schedules, setSchedules] = useState<UrlSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [newSched, setNewSched] = useState({
    name: "",
    urls: [""] as string[],
    cron: "*/30 * * * *",
    customCron: "",
    status: "active" as "active" | "paused",
  });
  const [schedCreating, setSchedCreating] = useState(false);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<ScheduleRun[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [selectedRunScheduleId, setSelectedRunScheduleId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load history ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/leads/scrape-url")
      .then((r) => r.json())
      .then((data: {
        sessions?: Array<{
          id: string; scraped_url: string; platform: string | null;
          posts_found: number; posts_inserted: number; duplicates: number;
          success: boolean; error_message: string | null; scraped_at: string;
        }>;
      }) => {
        if (data.sessions) {
          setHistory(data.sessions.map((s) => ({
            id: s.id, url: s.scraped_url, platform: s.platform ?? undefined,
            postsFound: s.posts_found, inserted: s.posts_inserted,
            duplicates: s.duplicates, timestamp: new Date(s.scraped_at),
            error: s.error_message ?? undefined,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // ── Run history ──────────────────────────────────────
  const loadRunHistory = useCallback(async (scheduleId?: string) => {
    setRunHistoryLoading(true);
    try {
      const url = scheduleId
        ? `/api/schedules/runs?scheduleId=${scheduleId}`
        : "/api/schedules/runs";
      const res = await fetch(url);
      const data = await res.json();
      setRunHistory(data.runs ?? []);
    } catch {
      setRunHistory([]);
    } finally {
      setRunHistoryLoading(false);
    }
  }, []);

  // ── Load schedules + auto-poll every 30s when on tab ────
  const loadSchedules = useCallback((silent = false) => {
    if (!silent) setSchedulesLoading(true);
    return fetch("/api/schedules")
      .then((r) => r.json())
      .then((data: { schedules?: UrlSchedule[] }) => setSchedules(data.schedules ?? []))
      .catch(() => {})
      .finally(() => { if (!silent) setSchedulesLoading(false); });
  }, []);

  useEffect(() => {
    if (activeTab !== "schedules") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    loadSchedules();
    pollRef.current = setInterval(() => loadSchedules(true), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTab, loadSchedules]);

  useEffect(() => {
    if (activeTab === "runs") {
      loadSchedules(true);
      loadRunHistory(selectedRunScheduleId ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── URL list helpers ─────────────────────────────────────
  const addUrl = () => setUrls((p) => [...p, ""]);
  const removeUrl = (i: number) =>
    setUrls((p) => (p.length === 1 ? [""] : p.filter((_, j) => j !== i)));
  const updateUrl = (i: number, v: string) =>
    setUrls((p) => p.map((u, j) => (j === i ? v : u)));

  // ── Scrape handler ───────────────────────────────────────
  const handleScrape = async () => {
    const validUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (!validUrls.length || loading) return;
    setLoading(true);
    setResults([]);
    setTotals(null);
    setScrapeError(null);
    try {
      const res = await fetch("/api/leads/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls }),
      });
      const data: MultiScrapeResponse = await res.json();
      if (!res.ok || data.error) {
        setScrapeError(data.error || "Scrape failed");
      } else {
        const items = data.items ?? [];
        setResults(items);
        setTotals({ inserted: data.totalInserted ?? 0, found: data.totalPostsFound ?? 0, dupes: data.totalDuplicates ?? 0 });
        setHistory((prev) => [
          ...items.map((item) => ({
            url: item.url, platform: item.platform ?? undefined,
            postsFound: item.postsFound ?? 0, inserted: item.batch?.inserted ?? 0,
            duplicates: item.batch?.duplicates ?? 0, timestamp: new Date(),
            error: item.error ?? item.errors?.[0],
          })),
          ...prev,
        ]);
      }
    } catch {
      setScrapeError("Could not reach scraper service");
    } finally {
      setLoading(false);
    }
  };

  // ── Schedule URL list helpers ────────────────────────────
  const addSchedUrl = () => setNewSched((s) => ({ ...s, urls: [...s.urls, ""] }));
  const removeSchedUrl = (i: number) =>
    setNewSched((s) => ({ ...s, urls: s.urls.length === 1 ? [""] : s.urls.filter((_, j) => j !== i) }));
  const updateSchedUrl = (i: number, v: string) =>
    setNewSched((s) => ({ ...s, urls: s.urls.map((u, j) => (j === i ? v : u)) }));

  // ── Schedule actions ─────────────────────────────────────
  const handleCreateSchedule = async () => {
    const effectiveCron = newSched.cron === "custom" ? newSched.customCron.trim() : newSched.cron;
    setSchedError(null);
    if (!newSched.name.trim()) { setSchedError("Schedule name is required"); return; }
    const validUrls = newSched.urls.map((u) => u.trim()).filter(Boolean);
    if (validUrls.length === 0) { setSchedError("At least one target URL is required"); return; }
    for (const u of validUrls) {
      try { new URL(u); } catch { setSchedError(`Invalid URL: ${u}`); return; }
    }
    if (!effectiveCron) { setSchedError("Please enter a cron expression"); return; }

    setSchedCreating(true);
    try {
      const errors: string[] = [];
      for (let i = 0; i < validUrls.length; i++) {
        const name = validUrls.length > 1
          ? `${newSched.name.trim()} (#${i + 1})`
          : newSched.name.trim();
        const res = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, url: validUrls[i],
            cron: effectiveCron, status: newSched.status,
          }),
        });
        const data = await res.json();
        if (!res.ok) errors.push(data.error || `Failed to create schedule for ${validUrls[i]}`);
      }
      if (errors.length > 0) {
        setSchedError(errors.join("; "));
      } else {
        setNewSched({ name: "", urls: [""], cron: "*/30 * * * *", customCron: "", status: "active" });
      }
      loadSchedules();
    } catch {
      setSchedError("Could not reach scraper service");
    } finally {
      setSchedCreating(false);
    }
  };

  const handlePause   = async (id: string) => { await fetch(`/api/schedules/${id}/pause`,  { method: "POST" }); loadSchedules(true); };
  const handleResume  = async (id: string) => { await fetch(`/api/schedules/${id}/resume`, { method: "POST" }); loadSchedules(true); };
  const handleRunNow  = async (id: string) => {
    setRunningId(id);
    await fetch(`/api/schedules/${id}/run`, { method: "POST" }).catch(() => {});
    setRunningId(null);
    loadSchedules(true);
  };
  const handleDelete  = async (id: string) => { await fetch(`/api/schedules/${id}`, { method: "DELETE" }); loadSchedules(true); };

  const validUrlCount = urls.filter((u) => u.trim()).length;

  // ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6">
      <Header
        title="Scrape URL"
        subtitle="Extract leads from any URL — social platforms, forums, blogs, job boards & more"
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["scrape", "schedules", "runs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "scrape" && <Search className="h-3.5 w-3.5" />}
            {tab === "schedules" && <Calendar className="h-3.5 w-3.5" />}
            {tab === "runs" && <Activity className="h-3.5 w-3.5" />}
            {tab === "scrape" ? "Scrape Now" : tab === "schedules" ? "Schedules" : "Run"}
            {tab === "schedules" && schedules.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                {schedules.length}
              </Badge>
            )}
            {tab === "runs" && runHistory.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                {runHistory.length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          TAB: SCRAPE NOW
      ═══════════════════════════════════════════════════ */}
      {activeTab === "scrape" && (
        <div className="space-y-4">
          {/* URL input card */}
          <Card className="border-border bg-card">
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Globe className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Paste URLs to scrape</p>
                  <p className="text-xs text-muted-foreground">
                    Add one or more URLs — mix platforms in the same run
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {urls.map((urlVal, idx) => {
                  const platform = detectPlatform(urlVal);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://www.facebook.com/groups/…"
                          value={urlVal}
                          onChange={(e) => updateUrl(idx, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleScrape(); }}
                          className="pl-9 pr-32 bg-secondary/50 border-border h-10 text-sm"
                          disabled={loading}
                        />
                        {platform && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <PlatformBadge platform={platform} />
                          </div>
                        )}
                      </div>
                      {urls.length > 1 && (
                        <button
                          onClick={() => removeUrl(idx)}
                          disabled={loading}
                          className="h-10 w-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addUrl} disabled={loading} className="gap-1.5 text-xs h-8">
                  <Plus className="h-3.5 w-3.5" />
                  Add URL
                </Button>
                <div className="flex-1" />
                <Button onClick={handleScrape} disabled={loading || validUrlCount === 0} className="gap-2 px-5 h-10">
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Scraping {validUrlCount} URL{validUrlCount !== 1 ? "s" : ""}…</>
                  ) : (
                    <><Search className="h-4 w-4" />Scrape {validUrlCount > 1 ? `${validUrlCount} URLs` : "URL"}</>
                  )}
                </Button>
              </div>

              {loading && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Scraping in progress…</p>
                    <p className="text-xs text-muted-foreground">URLs are processed sequentially. May take a few minutes.</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Error */}
          {scrapeError && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-rose-400">Scrape failed</p>
                <p className="text-xs text-rose-400/80">{scrapeError}</p>
              </div>
            </div>
          )}

          {/* Totals */}
          {totals && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Posts Found", value: totals.found,    icon: FileSearch, cls: "bg-primary/10 text-primary" },
                { label: "New Leads",   value: totals.inserted, icon: Sparkles,   cls: "bg-emerald-500/10 text-emerald-400" },
                { label: "Duplicates",  value: totals.dupes,    icon: Layers,     cls: "bg-amber-500/10 text-amber-400" },
              ].map((s) => (
                <Card key={s.label} className="border-border bg-card p-4 flex items-center gap-3">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", s.cls)}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
                    <p className="text-xl font-bold text-foreground leading-tight">{s.value}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Results + History grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              {results.length > 0 ? (
                <Card className="border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-foreground">Results</span>
                      <Badge variant="secondary" className="text-[10px]">{results.length} URL{results.length !== 1 ? "s" : ""}</Badge>
                    </div>
                    <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                      View Leads <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="p-3 space-y-2 max-h-130 overflow-y-auto">
                    {results.map((item, idx) => <UrlResultRow key={idx} item={item} index={idx} />)}
                  </div>
                </Card>
              ) : (
                <Card className="border-border bg-card">
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold text-foreground">Supported Platforms</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {PLATFORM_EXAMPLES.map((p) => {
                        const meta = PLATFORM_META[p.name];
                        return (
                          <div key={p.name} className={cn("rounded-lg border p-3 space-y-2", meta.bg, meta.border)}>
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                              <span className={cn("text-xs font-semibold", meta.color)}>{p.name}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{p.tip}</p>
                            {p.examples.map((ex) => (
                              <button key={ex} onClick={() => updateUrl(0, ex)} className="flex w-full items-center gap-1.5 text-left group/ex">
                                <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-[11px] text-muted-foreground group-hover/ex:text-foreground truncate transition-colors">{ex}</span>
                                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/ex:opacity-100 shrink-0 transition-opacity" />
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* History */}
            <Card className="border-border bg-card overflow-hidden">
              <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Scrape History</span>
                </div>
                {history.length > 0 && <Badge variant="secondary" className="text-[10px]">{history.length}</Badge>}
              </div>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading…</span>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Globe className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No scrapes yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
                  {history.map((entry, idx) => (
                    <div key={entry.id ?? idx} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => { setUrls([entry.url]); setActiveTab("scrape"); }}
                          className="text-[11px] text-primary hover:text-primary/80 hover:underline text-left truncate transition-colors"
                          title={entry.url}
                        >
                          {entry.url}
                        </button>
                        {entry.error
                          ? <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                          : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                      </div>
                      {entry.error ? (
                        <p className="text-[10px] text-rose-400 line-clamp-2">{entry.error}</p>
                      ) : (
                        <div className="flex flex-wrap gap-x-3">
                          {entry.platform && <span className="text-[10px] text-muted-foreground">{entry.platform}</span>}
                          <span className="text-[10px] text-foreground font-medium">{entry.postsFound} posts</span>
                          <span className="text-[10px] text-emerald-400">+{entry.inserted} leads</span>
                          {entry.duplicates > 0 && <span className="text-[10px] text-muted-foreground">{entry.duplicates} dupes</span>}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground/60">{formatHistoryTs(entry.timestamp)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: SCHEDULES
      ═══════════════════════════════════════════════════ */}
      {activeTab === "schedules" && (
        <div className="grid grid-cols-5 gap-5">

          {/* ── Create form (left 2 cols) ─────────────────── */}
          <div className="col-span-2">
            <Card className="border-border bg-card overflow-hidden">
              {/* Form header */}
              <div className="border-b border-border px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">New Schedule</p>
                    <p className="text-xs text-muted-foreground">Auto-scrape a URL on a recurring interval</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Name field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Schedule Name <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    placeholder="e.g. FB VA Group — Daily"
                    value={newSched.name}
                    onChange={(e) => setNewSched((s) => ({ ...s, name: e.target.value }))}
                    className="h-9 text-sm bg-secondary/50 border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">A short name to identify this schedule</p>
                </div>

                {/* URL fields */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Target URL{newSched.urls.length > 1 ? "s" : ""} <span className="text-rose-400">*</span>
                  </label>
                  <div className="space-y-2">
                    {newSched.urls.map((urlVal, idx) => {
                      const platform = detectPlatform(urlVal);
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="url"
                              placeholder="https://www.facebook.com/groups/…"
                              value={urlVal}
                              onChange={(e) => updateSchedUrl(idx, e.target.value)}
                              className="h-9 pl-9 pr-28 text-sm bg-secondary/50 border-border"
                            />
                            {platform && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <PlatformBadge platform={platform} />
                              </div>
                            )}
                          </div>
                          {newSched.urls.length > 1 && (
                            <button
                              onClick={() => removeSchedUrl(idx)}
                              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <Button variant="outline" size="sm" onClick={addSchedUrl} className="gap-1.5 text-xs h-7">
                      <Plus className="h-3 w-3" />
                      Add URL
                    </Button>
                    {newSched.urls.filter((u) => u.trim()).length > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        {newSched.urls.filter((u) => u.trim()).length} URLs — one schedule per URL
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {newSched.urls.length > 1
                      ? "Each URL will create a separate schedule with the same frequency"
                      : "The page that will be scraped automatically"}
                  </p>
                </div>

                <Separator />

                {/* Frequency picker — horizontal scroll pills */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Frequency</label>
                    {newSched.cron !== "custom" && (
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 border border-border rounded px-1.5 py-0.5">
                        {newSched.cron}
                      </span>
                    )}
                  </div>

                  {/* Pill row */}
                  <div className="flex gap-1.5 overflow-x-auto pt-1.5 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {CRON_PRESETS.map((preset) => {
                      const isSelected = newSched.cron === preset.value;
                      return (
                        <button
                          key={preset.value}
                          onClick={() => setNewSched((s) => ({ ...s, cron: preset.value }))}
                          className={cn(
                            "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-all",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {newSched.cron === "custom" && (
                    <div className="space-y-1.5">
                      <Input
                        placeholder="e.g. 0 9 * * 1-5  (weekdays 9 am)"
                        value={newSched.customCron}
                        onChange={(e) => setNewSched((s) => ({ ...s, customCron: e.target.value }))}
                        className="h-9 text-sm font-mono bg-secondary/50 border-border"
                      />
                      <p className="text-[11px] text-muted-foreground">Standard 5-field cron expression (min · hour · day · month · weekday)</p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Status toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Start immediately</p>
                    <p className="text-[11px] text-muted-foreground">Begin auto-scraping as soon as saved</p>
                  </div>
                  <button
                    onClick={() => setNewSched((s) => ({ ...s, status: s.status === "active" ? "paused" : "active" }))}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none",
                      newSched.status === "active" ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                      newSched.status === "active" ? "translate-x-4.5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>

                {/* Error */}
                {schedError && (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    <p className="text-xs text-rose-400">{schedError}</p>
                  </div>
                )}

                {/* Submit */}
                <div className="flex justify-end items-center">
                   <Button onClick={handleCreateSchedule} disabled={schedCreating} className="gap-2 h-9">
                  {schedCreating
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                    : <><Plus className="h-4 w-4" />Create Schedule</>}
                </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: RUN
      ═══════════════════════════════════════════════════ */}
      {activeTab === "runs" && (
        <div className="space-y-5">

          {/* ── Schedule table ───────────────────────────── */}
          <div className="space-y-3">
            {/* Summary stats */}
            {!schedulesLoading && schedules.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total",  value: schedules.length,                                      icon: Calendar, cls: "bg-primary/10 text-primary" },
                  { label: "Active", value: schedules.filter((s) => s.status === "active").length,  icon: Play,     cls: "bg-emerald-500/10 text-emerald-400" },
                  { label: "Paused", value: schedules.filter((s) => s.status === "paused").length,  icon: Pause,    cls: "bg-amber-500/10 text-amber-400" },
                ].map((stat) => (
                  <Card key={stat.label} className="border-border bg-card p-4 flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", stat.cls)}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{stat.label}</p>
                      <p className="text-xl font-bold text-foreground leading-tight">{stat.value}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Table card */}
            <Card className="border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Schedules</span>
                  {schedules.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{schedules.length}</Badge>
                  )}
                </div>
              </div>

              {schedulesLoading ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading schedules…</span>
                </div>
              ) : schedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60">
                    <Calendar className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">No schedules yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a schedule in the Schedules tab to see it here.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_116px_76px_108px_56px_96px] gap-3 px-4 py-2 border-b border-border bg-muted/30">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Schedule</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Frequency</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Next Run</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Runs</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</span>
                  </div>
                  {/* Rows */}
                  <div>
                    {schedules.map((s) => (
                      <ScheduleTableRow
                        key={s.id}
                        schedule={s}
                        runningId={runningId}
                        onViewRuns={(id) => { setSelectedRunScheduleId(id); loadRunHistory(id); }}
                        onRunNow={handleRunNow}
                        onPause={handlePause}
                        onResume={handleResume}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                  {/* Footer */}
                  <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      Click <Activity className="inline h-3 w-3" /> to filter run history below by schedule
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {schedules.filter((s) => s.status === "active").length} of {schedules.length} active
                    </p>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* ── Run history ──────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedRunScheduleId
                    ? (schedules.find((s) => s.id === selectedRunScheduleId)?.name ?? "Schedule Runs")
                    : "All Runs"}
                </p>
                <p className="text-xs text-muted-foreground">History of automated scrape executions</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedRunScheduleId && (
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-muted-foreground"
                    onClick={() => { setSelectedRunScheduleId(null); loadRunHistory(); }}>
                    <XCircle className="h-3.5 w-3.5" />
                    Clear filter
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                  onClick={() => loadRunHistory(selectedRunScheduleId ?? undefined)}>
                  <RefreshCw className={cn("h-3.5 w-3.5", runHistoryLoading && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>

            <Card className="border-border bg-card overflow-hidden">
              {runHistoryLoading ? (
                <div className="flex items-center justify-center py-16 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading runs…</span>
                </div>
              ) : runHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60">
                    <Timer className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">No runs yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                      Run history will appear here once a scheduled scrape executes.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {runHistory.map((run) => {
                    const schedInfo = schedules.find((s) => s.id === run.scheduleId);
                    const platform = schedInfo ? detectPlatform(schedInfo.url) : null;
                    const durationSec = run.finishedAt
                      ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                      : null;
                    return (
                      <div key={run.id} className="px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors space-y-1.5">
                        {/* Row 1 — platform badge + schedule name */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <PlatformBadge platform={platform} />
                          <span className="text-sm font-semibold text-foreground leading-tight truncate">
                            {run.scheduleName ?? run.scheduleId}
                          </span>
                        </div>
                        {/* Row 2 — URL */}
                        {schedInfo && (
                          <p className="text-[11px] text-muted-foreground font-mono truncate" title={schedInfo.url}>
                            {schedInfo.url}
                          </p>
                        )}
                        {/* Row 3 — metadata pills */}
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border px-2 py-0.5 text-[11px] font-mono text-foreground whitespace-nowrap">
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            {formatTs(run.startedAt)}
                          </span>
                          {durationSec !== null && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border px-2 py-0.5 text-[11px] font-mono text-foreground whitespace-nowrap">
                              <Timer className="h-3 w-3 text-muted-foreground shrink-0" />
                              {durationSec}s
                            </span>
                          )}
                          {run.status === "running" ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-primary/30 bg-primary/10 text-primary whitespace-nowrap">
                              <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Running
                            </Badge>
                          ) : run.status === "ok" ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 whitespace-nowrap">
                              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-rose-500/30 bg-rose-500/10 text-rose-400 whitespace-nowrap">
                              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-rose-400 inline-block" />Error
                            </Badge>
                          )}
                          {run.status === "ok" && (
                            <>
                              <span className="text-[11px] text-foreground font-medium">{run.postsFound} posts</span>
                              <span className="text-[11px] text-emerald-400 font-semibold">+{run.leadsInserted} leads</span>
                            </>
                          )}
                          {run.status === "error" && run.errorMessage && (
                            <span className="text-[11px] text-rose-400 truncate max-w-xs">{run.errorMessage}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
