"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Link2, Loader2, AlertTriangle,
  Plus, Trash2, Play, Pause, Calendar, RefreshCw, Timer,
  Zap, Activity, Layers, Pencil, Bookmark,
} from "lucide-react";
import { PlatformBadge } from "./platform-badge";
import type { UrlSchedule, NewSchedState, BookmarkEntry } from "./shared";
import {
  detectPlatform, cronLabel, cronIntervalMs, buildCustomCron, formatMs,
  CRON_PRESETS, DAY_LABELS, PLATFORM_META, DEFAULT_NEW_SCHED,
} from "./shared";

export function SchedulesTab({
  schedules,
  schedulesLoading,
  runningId,
  newSched, setNewSched,
  schedCreating,
  schedError, setSchedError,
  savedBookmarks,
  onCreateSchedule,
  onPause, onResume, onRunNow, onRunGroup, onDelete,
  onEditGroup,
  onRefresh,
  onOpenBmPicker,
}: {
  schedules: UrlSchedule[];
  schedulesLoading: boolean;
  runningId: string | null;
  newSched: NewSchedState;
  setNewSched: React.Dispatch<React.SetStateAction<NewSchedState>>;
  schedCreating: boolean;
  schedError: string | null;
  setSchedError: React.Dispatch<React.SetStateAction<string | null>>;
  savedBookmarks: BookmarkEntry[];
  onCreateSchedule: () => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
  onRunGroup: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditGroup: (items: UrlSchedule[]) => void;
  onRefresh: (silent?: boolean) => void;
  onOpenBmPicker: (target: "create" | "edit") => void;
}) {
  const addSchedUrl = () => setNewSched((s) => ({ ...s, urls: [...s.urls, ""] }));
  const removeSchedUrl = (i: number) =>
    setNewSched((s) => ({ ...s, urls: s.urls.length === 1 ? [""] : s.urls.filter((_, j) => j !== i) }));
  const updateSchedUrl = (i: number, v: string) =>
    setNewSched((s) => ({ ...s, urls: s.urls.map((u, j) => (j === i ? v : u)) }));

  // Group schedules by base name
  const grouped: { baseName: string; items: UrlSchedule[] }[] = [];
  const map = new Map<string, UrlSchedule[]>();
  for (const s of schedules) {
    const base = s.name.replace(/\s*\(#\d+\)$/, "").trim();
    if (!map.has(base)) { map.set(base, []); grouped.push({ baseName: base, items: map.get(base)! }); }
    map.get(base)!.push(s);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* ── Create form (left 2 cols) ─────────────────── */}
      <div className="lg:col-span-2">
        <Card className="border-border bg-card overflow-hidden">
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
                {savedBookmarks.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenBmPicker("create")}
                    className="gap-1.5 text-xs h-7"
                  >
                    <Bookmark className="h-3 w-3" />
                    From Bookmarks
                  </Button>
                )}
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

            {/* Frequency picker */}
            <CronPicker
              cron={newSched.cron}
              customMode={newSched.customMode}
              customMinutes={newSched.customMinutes}
              customHours={newSched.customHours}
              customTime={newSched.customTime}
              customDays={newSched.customDays}
              customCron={newSched.customCron}
              onChange={(updates) => setNewSched((s) => ({ ...s, ...updates }))}
            />

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
              <Button onClick={onCreateSchedule} disabled={schedCreating} className="gap-2 h-9">
                {schedCreating
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                  : <><Plus className="h-4 w-4" />Create Schedule</>}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Schedule list (right 3 cols) ─────────────── */}
      <div className="lg:col-span-3">
        <Card className="border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Layers className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Schedules</p>
                  <p className="text-xs text-muted-foreground">
                    {schedules.length} schedule{schedules.length !== 1 ? "s" : ""}
                    {schedules.filter((s) => s.status === "active").length > 0 && (
                      <> &middot; {schedules.filter((s) => s.status === "active").length} active</>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onRefresh(true)}
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>
          </div>

          {schedulesLoading && schedules.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading schedules…</span>
            </div>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3">
                <Calendar className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No schedules yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create one using the form on the left</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Schedule Name</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Target URLs</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Frequency</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Auto-scrape</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => {
                  const first = group.items[0];
                  const allActive = group.items.every((s) => s.status === "active");
                  const someActive = group.items.some((s) => s.status === "active");
                  const earliest = group.items.reduce((min, s) => s.createdAt < min ? s.createdAt : min, group.items[0].createdAt);
                  return (
                    <tr
                      key={first.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer align-top"
                      onClick={() => onEditGroup(group.items)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">{group.baseName}</span>
                          {group.items.length > 1 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-border bg-muted/30 text-muted-foreground">
                              {group.items.length} URLs
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-55">
                        <div className="flex items-center gap-2 min-w-0">
                          {(() => { const p = detectPlatform(first.url); return p ? <PlatformBadge platform={p} /> : null; })()}
                          <span className="text-[11px] font-mono text-muted-foreground truncate" title={first.url}>
                            {first.url}
                          </span>
                          {group.items.length > 1 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted/60 px-1.5 text-[10px] font-semibold text-muted-foreground tabular-nums shrink-0">
                              +{group.items.length - 1}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Timer className="h-3 w-3 shrink-0" />
                          {cronLabel(first.cron)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(earliest).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 rounded-full h-5 whitespace-nowrap",
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
                          {allActive ? "Enabled" : someActive ? "Partial" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {group.items.length > 1 && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await onRunGroup(first.id);
                                    }}
                                    disabled={!!runningId}
                                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                                  >
                                    {runningId === first.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Run all {group.items.length} URLs sequentially</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await Promise.all(group.items.map((s) =>
                                fetch(`/api/schedules/${s.id}`, { method: "DELETE" }).catch(() => {})
                              ));
                              onRefresh(true);
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CronPicker — reusable frequency picker (shared by create + edit)
// ─────────────────────────────────────────────────────────────────────────────

export function CronPicker({
  cron, customMode, customMinutes, customHours, customTime, customDays, customCron,
  onChange,
}: {
  cron: string;
  customMode: "minutes" | "hours" | "daily" | "weekly" | "raw";
  customMinutes: string;
  customHours: string;
  customTime: string;
  customDays: number[];
  customCron: string;
  onChange: (updates: Partial<NewSchedState>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">Frequency</label>
        {cron !== "custom" && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 border border-border rounded px-1.5 py-0.5">
            {cron}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 overflow-x-auto pt-1.5 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {CRON_PRESETS.map((preset) => {
          const isSelected = cron === preset.value;
          return (
            <button
              key={preset.value}
              onClick={() => onChange({ cron: preset.value })}
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

      {cron === "custom" && (
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {([
              { value: "minutes", label: "Minutes" },
              { value: "hours",   label: "Hours" },
              { value: "daily",   label: "Daily" },
              { value: "weekly",  label: "Weekly" },
              { value: "raw",     label: "Advanced" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChange({ customMode: opt.value })}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all",
                  customMode === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {customMode === "minutes" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Every</span>
              <select
                value={customMinutes}
                onChange={(e) => onChange({ customMinutes: e.target.value })}
                className="h-9 rounded-md border border-border bg-secondary/50 px-2 text-sm text-foreground"
              >
                {[5, 10, 15, 20, 30, 45].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          )}

          {customMode === "hours" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Every</span>
              <select
                value={customHours}
                onChange={(e) => onChange({ customHours: e.target.value })}
                className="h-9 rounded-md border border-border bg-secondary/50 px-2 text-sm text-foreground"
              >
                {[1, 2, 3, 4, 6, 8, 12].map((v) => <option key={v} value={String(v)}>{v}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
          )}

          {customMode === "daily" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Every day at</span>
              <Input
                type="time"
                value={customTime}
                onChange={(e) => onChange({ customTime: e.target.value })}
                className="h-9 w-28 text-sm bg-secondary/50 border-border"
              />
            </div>
          )}

          {customMode === "weekly" && (
            <div className="space-y-2.5">
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => {
                  const active = customDays.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        const days = active ? customDays.filter((d) => d !== i) : [...customDays, i];
                        onChange({ customDays: days.length > 0 ? days : [i] });
                      }}
                      className={cn(
                        "h-8 w-9 rounded-md text-[11px] font-medium transition-all",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/50 border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">at</span>
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => onChange({ customTime: e.target.value })}
                  className="h-9 w-28 text-sm bg-secondary/50 border-border"
                />
              </div>
            </div>
          )}

          {customMode === "raw" && (
            <div className="space-y-1.5">
              <Input
                placeholder="e.g. 0 9 * * 1-5  (weekdays 9 am)"
                value={customCron}
                onChange={(e) => onChange({ customCron: e.target.value })}
                className="h-9 text-sm font-mono bg-secondary/50 border-border"
              />
              <p className="text-[11px] text-muted-foreground">Standard 5-field cron expression (min · hour · day · month · weekday)</p>
            </div>
          )}

          {customMode !== "raw" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Cron:</span>
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 border border-border rounded px-1.5 py-0.5">
                {buildCustomCron(customMode, { minutes: customMinutes, hours: customHours, time: customTime, days: customDays })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
