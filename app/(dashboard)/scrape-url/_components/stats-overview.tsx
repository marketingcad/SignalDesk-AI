"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Layers, Radio, Repeat, HeartPulse } from "lucide-react";
import type { UrlSchedule } from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// StatsOverview — at-a-glance KPI strip for the scrape-url scheduler
// Derived entirely from the schedules list (always loaded), so it stays in sync
// on both tabs without extra fetches.
// ─────────────────────────────────────────────────────────────────────────────

export function StatsOverview({ schedules }: { schedules: UrlSchedule[] }) {
  const groups = new Set(
    schedules.map((s) => s.name.replace(/\s*\(#\d+\)$/, "").trim())
  ).size;
  const active = schedules.filter((s) => s.status === "active").length;
  const paused = schedules.length - active;
  const totalRuns = schedules.reduce((sum, s) => sum + s.totalRuns, 0);
  const ran = schedules.filter((s) => s.lastRunStatus !== null);
  const healthy = ran.filter((s) => s.lastRunStatus === "ok").length;
  const healthPct = ran.length > 0 ? Math.round((healthy / ran.length) * 100) : null;

  const cards = [
    {
      label: "Schedules",
      value: groups,
      sub: `${schedules.length} URL${schedules.length !== 1 ? "s" : ""} tracked`,
      icon: Layers,
      accent: "var(--color-primary)",
    },
    {
      label: "Active",
      value: active,
      sub: paused > 0 ? `${paused} paused` : "all running",
      icon: Radio,
      accent: "#10b981",
      live: active > 0,
    },
    {
      label: "Total Runs",
      value: totalRuns.toLocaleString(),
      sub: "lifetime scrapes",
      icon: Repeat,
      accent: "#6366f1",
    },
    {
      label: "Success Rate",
      value: healthPct === null ? "—" : `${healthPct}%`,
      sub: ran.length > 0 ? `${healthy}/${ran.length} healthy` : "no runs yet",
      icon: HeartPulse,
      accent: healthPct === null ? "#a1a1aa" : healthPct >= 80 ? "#10b981" : healthPct >= 50 ? "#f59e0b" : "#f43f5e",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((c, i) => (
        <Card
          key={c.label}
          className={cn(
            "group relative overflow-hidden border-border bg-card p-4 sm:p-5",
            "transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5",
            "animate-fade-in",
            i === 1 && "delay-1", i === 2 && "delay-2", i === 3 && "delay-3"
          )}
        >
          {/* Accent glow */}
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.10] blur-2xl transition-opacity group-hover:opacity-[0.18]"
            style={{ background: c.accent }}
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {c.value}
              </p>
            </div>
            <div
              className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in oklab, ${c.accent} 14%, transparent)` }}
            >
              <c.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: c.accent }} />
              {c.live && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground truncate">{c.sub}</p>
        </Card>
      ))}
    </div>
  );
}
