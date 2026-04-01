"use client";

import { useState, useEffect } from "react";
import { Loader2, Clock } from "lucide-react";
import { cronIntervalMs, formatMs } from "./shared";

export function ScheduleCountdown({ cron, lastRunAt, createdAt, status, isRunning }: {
  cron: string;
  lastRunAt: string | null;
  createdAt: string;
  status: "active" | "paused";
  isRunning: boolean;
}) {
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const intervalMs = cronIntervalMs(cron);

  useEffect(() => {
    const baseTime = lastRunAt ?? createdAt;
    if (status !== "active" || isRunning || !baseTime || !intervalMs) {
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
  }, [lastRunAt, createdAt, status, isRunning, intervalMs]);

  if (isRunning) {
    return (
      <span className="text-[11px] text-primary font-medium flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Running…
      </span>
    );
  }

  if (status === "paused") {
    return <span className="text-[11px] text-muted-foreground/50 italic">Paused</span>;
  }

  if (msLeft === null || !intervalMs) return null;

  const progress = Math.min(100, Math.round(((intervalMs - msLeft) / intervalMs) * 100));

  return (
    <>
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
        <Clock className="h-3 w-3 shrink-0" />
        in {formatMs(msLeft)}
      </span>
      <div className="flex-1 min-w-12 h-1 rounded-full bg-muted/80 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
    </>
  );
}
