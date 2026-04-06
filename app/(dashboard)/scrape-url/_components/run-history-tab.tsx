"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  Loader2, CheckCircle2, Clock, Play, Pause, Trash2,
  Calendar, RefreshCw, Timer, XCircle, ChevronRight,
  ChevronDown, ChevronUp, ExternalLink, User, FileText,
  AlertTriangle, Zap, Activity,
} from "lucide-react";
import { openUrl } from "@/lib/open-url";

import { PlatformBadge } from "./platform-badge";
import { ScheduleCountdown } from "./schedule-countdown";
import type { UrlSchedule, ScheduleRun } from "./shared";
import { detectPlatform, cronLabel, formatTs } from "./shared";

export function RunHistoryTab({
  schedules,
  schedulesLoading,
  runningId,
  runHistory,
  runHistoryLoading,
  clearingRuns,
  selectedRunScheduleId,
  onSelectSchedule,
  onLoadRunHistory,
  onClearAllRuns,
  onRunNow,
  onPause,
  onResume,
  onDelete,
  onRefreshSchedules,
}: {
  schedules: UrlSchedule[];
  schedulesLoading: boolean;
  runningId: string | null;
  runHistory: ScheduleRun[];
  runHistoryLoading: boolean;
  clearingRuns: boolean;
  selectedRunScheduleId: string | null;
  onSelectSchedule: (id: string | null) => void;
  onLoadRunHistory: (scheduleId?: string) => Promise<void>;
  onClearAllRuns: () => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefreshSchedules: (silent?: boolean) => void;
}) {
  const [expandedRunGroup, setExpandedRunGroup] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Group schedules by base name
  const runGroups: { baseName: string; items: UrlSchedule[] }[] = [];
  const rMap = new Map<string, UrlSchedule[]>();
  for (const s of schedules) {
    const base = s.name.replace(/\s*\(#\d+\)$/, "").trim();
    if (!rMap.has(base)) { rMap.set(base, []); runGroups.push({ baseName: base, items: rMap.get(base)! }); }
    rMap.get(base)!.push(s);
  }

  // Derive which schedule IDs are actively running from run history
  const activelyRunningIds = new Set(
    runHistory.filter((r) => r.status === "running").map((r) => r.scheduleId)
  );

  // Build group progress info: which groups have active runs
  const groupProgress: { baseName: string; total: number; completed: number; currentUrl: string; currentName: string }[] = [];
  for (const group of runGroups) {
    const groupIds = new Set(group.items.map((s) => s.id));
    const groupRuns = runHistory.filter((r) => groupIds.has(r.scheduleId));
    // Find recent batch: runs started within the same 10-minute window as the latest running one
    const runningInGroup = groupRuns.filter((r) => r.status === "running");
    if (runningInGroup.length === 0) continue;

    const latestRunStart = new Date(runningInGroup[0].startedAt).getTime();
    const batchWindow = 10 * 60 * 1000; // 10 min
    const batchRuns = groupRuns.filter(
      (r) => Math.abs(new Date(r.startedAt).getTime() - latestRunStart) < batchWindow
        || r.status === "running"
    );
    const completed = batchRuns.filter((r) => r.status !== "running").length;
    const currentRun = runningInGroup[0];
    const currentSched = group.items.find((s) => s.id === currentRun.scheduleId);

    groupProgress.push({
      baseName: group.baseName,
      total: group.items.length,
      completed,
      currentUrl: currentSched?.url ?? "",
      currentName: currentRun.scheduleName ?? currentSched?.name ?? "",
    });
  }

  // Recent failed runs (last 10 minutes) for error alerts
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const recentFailedRuns = runHistory.filter(
    (r) => r.status === "error" && new Date(r.startedAt).getTime() > tenMinAgo
  );

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      {!schedulesLoading && schedules.length > 0 && (
        <div className="flex items-center gap-3 flex-nowrap max-sm:flex-wrap">
          {[
            { label: "Total",  value: schedules.length,                                      icon: Calendar, cls: "bg-primary/10 text-primary" },
            { label: "Active", value: schedules.filter((s) => s.status === "active").length,  icon: Play,     cls: "bg-emerald-500/10 text-emerald-400" },
            { label: "Paused", value: schedules.filter((s) => s.status === "paused").length,  icon: Pause,    cls: "bg-amber-500/10 text-amber-400" },
          ].map((stat) => (
            <Card key={stat.label} className="border-border bg-card p-3 px-4 flex items-center gap-3 flex-1 min-w-0">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", stat.cls)}>
                <stat.icon className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold text-foreground leading-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{stat.label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Active group run progress banners */}
      {groupProgress.map((gp) => (
        <div key={gp.baseName} className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                Scraping in progress — {gp.baseName}
              </span>
              <Badge variant="outline" className="text-[10px] px-2 rounded-full h-5 border-primary/30 bg-primary/10 text-primary">
                URL {gp.completed + 1} of {gp.total}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted-foreground">Currently scraping:</span>
              <span className="text-[11px] text-foreground font-mono truncate">{gp.currentUrl}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.max(((gp.completed + 0.5) / gp.total) * 100, 5)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {gp.completed} of {gp.total} URLs completed
            </p>
          </div>
        </div>
      ))}

      {/* Recent error alerts */}
      {recentFailedRuns.length > 0 && groupProgress.length === 0 && (
        <div className="space-y-2">
          {recentFailedRuns.slice(0, 5).map((run) => {
            const schedInfo = schedules.find((s) => s.id === run.scheduleId);
            return (
              <div key={run.id} className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/20 mt-0.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-rose-400">Scrape failed</span>
                    <span className="text-[11px] text-foreground font-medium truncate">
                      {run.scheduleName ?? run.scheduleId}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatTs(run.startedAt)}</span>
                  </div>
                  {schedInfo && (
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5" title={schedInfo.url}>
                      {schedInfo.url}
                    </p>
                  )}
                  {run.errorMessage && (
                    <p className="text-[11px] text-rose-400/80 mt-1 leading-relaxed line-clamp-2">
                      {run.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex justify-center gap-4">
        {/* Schedule list */}
        <div className="rounded-lg border border-border bg-card overflow-hidden w-full">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
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
              <div className="divide-y divide-border h-130 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                {runGroups.map((group) => {
                  const first = group.items[0];
                  const isExpanded = expandedRunGroup === group.baseName;
                  const allActive = group.items.every((s) => s.status === "active");
                  const someActive = group.items.some((s) => s.status === "active");
                  const groupRunning = group.items.some((s) => runningId === s.id || activelyRunningIds.has(s.id));
                  return (
                    <div key={first.id}>
                      <button
                        onClick={() => setExpandedRunGroup(isExpanded ? null : group.baseName)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors text-left"
                      >
                        {group.items.length > 1 && (
                          <ChevronRight className={cn(
                            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                            isExpanded && "rotate-90"
                          )} />
                        )}
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          allActive
                            ? "bg-emerald-500/10 border-emerald-500/20"
                            : someActive
                              ? "bg-amber-500/10 border-amber-500/20"
                              : "bg-muted/40 border-border"
                        )}>
                          {groupRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : allActive ? (
                            <Play className="h-4 w-4 text-emerald-400" />
                          ) : someActive ? (
                            <Play className="h-4 w-4 text-amber-400" />
                          ) : (
                            <Pause className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground leading-tight truncate">
                              {group.baseName}
                            </span>
                            {group.items.length > 1 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-border bg-muted/30 text-muted-foreground shrink-0">
                                {group.items.length} URLs
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 rounded-full h-5 shrink-0",
                                allActive
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : someActive
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                    : "border-border bg-muted/30 text-muted-foreground"
                              )}
                            >
                              <span className={cn(
                                "mr-1 h-1.5 w-1.5 rounded-full inline-block shrink-0",
                                allActive ? "bg-emerald-400 animate-pulse" : someActive ? "bg-amber-400" : "bg-muted-foreground"
                              )} />
                              {allActive ? "Active" : someActive ? "Partial" : "Paused"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Timer className="h-3 w-3 shrink-0" />
                              {cronLabel(first.cron)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {group.items.reduce((sum, s) => sum + s.totalRuns, 0)} runs
                            </span>
                            <ScheduleCountdown
                              cron={first.cron}
                              lastRunAt={first.lastRunAt}
                              createdAt={first.createdAt}
                              status={allActive ? "active" : "paused"}
                              isRunning={groupRunning}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-1.5 text-muted-foreground hover:text-primary"
                                  onClick={() => { onSelectSchedule(first.id); onLoadRunHistory(first.id); }}>
                                  <Activity className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View runs</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                  onClick={() => { for (const s of group.items) onRunNow(s.id); }}
                                  disabled={groupRunning}>
                                  {groupRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Run all now</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {allActive ? (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400"
                                    onClick={() => { for (const s of group.items) onPause(s.id); }}>
                                    <Pause className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-400"
                                    onClick={() => { for (const s of group.items) onResume(s.id); }}>
                                    <Play className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </TooltipTrigger>
                              <TooltipContent>{allActive ? "Pause all" : "Resume all"}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                                  onClick={async () => {
                                    await Promise.all(group.items.map((s) =>
                                      fetch(`/api/schedules/${s.id}`, { method: "DELETE" }).catch(() => {})
                                    ));
                                    onRefreshSchedules(true);
                                  }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </button>

                      {isExpanded && group.items.length > 1 && (
                        <div className="border-t border-border/50 bg-muted/10">
                          {group.items.map((sched) => {
                            const platform = detectPlatform(sched.url);
                            const isRunning = runningId === sched.id || activelyRunningIds.has(sched.id);
                            return (
                              <div
                                key={sched.id}
                                className="flex items-center gap-3 px-4 py-2.5 pl-14 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                              >
                                <div className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                                  isRunning ? "bg-primary/10" : sched.status === "active" ? "bg-emerald-500/10" : "bg-muted/40"
                                )}>
                                  {isRunning ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                  ) : sched.status === "active" ? (
                                    <Play className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Pause className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {platform && <PlatformBadge platform={platform} />}
                                  <span className="text-[11px] font-mono text-muted-foreground truncate" title={sched.url}>
                                    {sched.url}
                                  </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {sched.totalRuns} runs
                                </span>
                                {isRunning && (
                                  <span className="text-[10px] text-primary font-medium flex items-center gap-1 shrink-0">
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
                                  </span>
                                )}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                          onClick={() => { onSelectSchedule(sched.id); onLoadRunHistory(sched.id); }}>
                                          <Activity className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>View runs for this URL</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                          onClick={() => onRunNow(sched.id)} disabled={isRunning}>
                                          {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Run now</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  Click <Activity className="inline h-3 w-3" /> to filter runs by schedule
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {schedules.filter((s) => s.status === "active").length} of {schedules.length} active
                </p>
              </div>
            </>
          )}
        </div>

        {/* Run history */}
        <div className="rounded-lg border border-border bg-card overflow-hidden min-w-0">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {selectedRunScheduleId
                  ? (schedules.find((s) => s.id === selectedRunScheduleId)?.name ?? "Schedule Runs")
                  : "All Runs"}
              </span>
              {runHistory.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{runHistory.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {selectedRunScheduleId && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground"
                  onClick={() => { onSelectSchedule(null); onLoadRunHistory(); }}>
                  <XCircle className="h-3 w-3 mr-1" />
                  Clear filter
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={() => onLoadRunHistory(selectedRunScheduleId ?? undefined)}>
                <RefreshCw className={cn("h-3 w-3", runHistoryLoading && "animate-spin")} />
              </Button>
              {runHistory.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-rose-400"
                      disabled={clearingRuns}
                    >
                      {clearingRuns ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all run history?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all {runHistory.length} run {runHistory.length === 1 ? "entry" : "entries"}. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onClearAllRuns}
                        className="bg-rose-600 text-white hover:bg-rose-700"
                      >
                        Clear All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
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
            <div className="divide-y divide-border h-130 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              {runHistory.map((run) => {
                const schedInfo = schedules.find((s) => s.id === run.scheduleId);
                const platform = schedInfo ? detectPlatform(schedInfo.url) : null;
                const durationSec = run.finishedAt
                  ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                  : null;
                const posts = run.scrapedPosts ?? [];
                const isRunExpanded = expandedRunId === run.id;
                return (
                  <div key={run.id}>
                    <div className={cn(
                      "px-4 py-3 hover:bg-muted/20 transition-colors",
                      run.status === "error" && "border-l-2 border-l-rose-500 bg-rose-500/5",
                      run.status === "running" && "border-l-2 border-l-primary bg-primary/5"
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {run.status === "running" ? (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            </div>
                          ) : run.status === "ok" ? (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/20">
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-foreground truncate">
                                {run.scheduleName ?? run.scheduleId}
                              </span>
                              <PlatformBadge platform={platform} />
                            </div>
                            {schedInfo && (
                              <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5" title={schedInfo.url}>
                                {schedInfo.url}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {run.status === "running" ? (
                            <Badge variant="outline" className="text-[10px] px-2 rounded-full h-5 border-primary/30 bg-primary/10 text-primary">Running</Badge>
                          ) : run.status === "ok" ? (
                            <Badge variant="outline" className="text-[10px] px-2 rounded-full h-5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Success</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-2 rounded-full h-5 border-rose-500/30 bg-rose-500/10 text-rose-400">Failed</Badge>
                          )}
                          {posts.length > 0 && (
                            <button
                              onClick={() => setExpandedRunId(isRunExpanded ? null : run.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title={isRunExpanded ? "Hide posts" : `Show ${posts.length} posts`}
                            >
                              {isRunExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 ml-10.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          {formatTs(run.startedAt)}
                        </span>
                        {durationSec !== null && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Timer className="h-3 w-3 shrink-0" />
                            {durationSec}s
                          </span>
                        )}
                        {run.status === "ok" && (
                          <>
                            {posts.length > 0 ? (
                              <button
                                onClick={() => setExpandedRunId(isRunExpanded ? null : run.id)}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                {run.postsFound} posts found
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">{run.postsFound} posts found</span>
                            )}
                            <span className="text-[11px] text-emerald-400 font-semibold">+{run.leadsInserted} leads</span>
                          </>
                        )}
                        {run.status === "error" && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Scrape failed
                          </span>
                        )}
                      </div>
                      {/* Error detail block */}
                      {run.status === "error" && run.errorMessage && (
                        <div className="mt-2 ml-10.5 rounded-md bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                          <p className="text-[11px] text-rose-400 leading-relaxed wrap-break-word">
                            {run.errorMessage}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Expanded scraped posts list */}
                    {isRunExpanded && posts.length > 0 && (
                      <div className="border-t border-border/50 bg-muted/10">
                        <div className="px-4 py-2 border-b border-border/30 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Posts Found ({posts.length})
                          </span>
                        </div>
                        <div className="divide-y divide-border/30 max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                          {posts.map((post, pi) => (
                            <div key={pi} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                              <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-5 text-right pt-0.5">
                                {pi + 1}.
                              </span>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-[11px] font-semibold text-foreground">{post.author}</span>
                                  <PlatformBadge platform={post.platform} />
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                                  {post.text}
                                </p>
                                {post.matchedKeywords?.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {post.matchedKeywords.map((kw, ki) => (
                                      <span
                                        key={ki}
                                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                                      >
                                        {kw}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {post.url && (
                                  <button
                                    onClick={() => openUrl(post.url)}
                                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-2.5 w-2.5" />
                                    <span className="truncate max-w-xs">{post.url}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
