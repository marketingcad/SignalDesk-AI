"use client";

import { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Trophy, Info, Loader2 } from "lucide-react";
import type { OutreachAnalytics, RateStat } from "@/lib/outreach-analytics";

const TONE_LABELS: Record<string, string> = {
  friendly: "Friendly",
  professional: "Professional",
  direct: "Direct",
};
const CHANNEL_LABELS: Record<string, string> = {
  comment: "Comment",
  dm: "DM",
};

// Funnel stage palette — an analogous cool→green ramp so the sequence reads as
// progress toward success (Won). Each downstream surface (rate tiles, trend)
// reuses the stage's colour so the whole section is one visual system.
const STAGE = {
  drafted: "#a78bfa", // violet-400  — top of funnel
  sent: "#60a5fa", // blue-400    — reached out
  progressed: "#22d3ee", // cyan-400    — proposal sent+
  won: "#34d399", // emerald-400 — success
} as const;

export function OutreachAnalyticsSection() {
  const [data, setData] = useState<OutreachAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/outreach?days=30")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Outreach Performance</h2>
          <p className="text-xs text-muted-foreground">
            Which AI-drafted outreach converts — last 30 days
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading outreach analytics…
        </div>
      ) : !data || data.funnel.drafted === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground/70">No outreach drafts yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mt-1">
            Generate a reply from a lead (Leads → Draft Reply) and this fills in as
            you copy drafts and move leads through the pipeline.
          </p>
        </div>
      ) : (
        <div className="p-5 space-y-6">
          {/* Funnel */}
          <Funnel funnel={data.funnel} />

          {/* Rate tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RateTile
              label="Send rate"
              hint="Drafts copied ÷ drafts generated"
              stat={data.rates.sendRate}
              icon={Send}
              color={STAGE.sent}
            />
            <RateTile
              label="Progression rate"
              hint="Reached Proposal Sent+ ÷ sent"
              stat={data.rates.progressionRate}
              icon={MessageSquare}
              color={STAGE.progressed}
            />
            <RateTile
              label="Win rate"
              hint="Won ÷ sent"
              stat={data.rates.winRate}
              icon={Trophy}
              color={STAGE.won}
            />
          </div>

          {/* Tone + Channel win-rate comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Breakdown
              title="Win rate by tone"
              rows={(["friendly", "professional", "direct"] as const).map((k) => ({
                label: TONE_LABELS[k],
                stat: data.byTone[k].winRate,
              }))}
            />
            <Breakdown
              title="Win rate by channel"
              rows={(["comment", "dm"] as const).map((k) => ({
                label: CHANNEL_LABELS[k],
                stat: data.byChannel[k].winRate,
              }))}
            />
          </div>

          {/* Trend */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Drafts generated vs. sent
            </p>
            <TrendChart series={data.timeseries} />
          </div>

          {/* Honesty disclaimer */}
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>
              &ldquo;Sent&rdquo; means the draft was <span className="font-medium text-foreground/80">copied</span>.
              &ldquo;Won&rdquo; and &ldquo;Proposal Sent&rdquo; reflect pipeline stages you set
              manually. Rates show the sample size (n) — treat small samples with care.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Funnel({ funnel }: { funnel: OutreachAnalytics["funnel"] }) {
  const max = Math.max(funnel.drafted, 1);
  const steps = [
    { label: "Drafted", value: funnel.drafted, color: STAGE.drafted },
    { label: "Sent", value: funnel.sent, color: STAGE.sent },
    { label: "Proposal Sent+", value: funnel.progressed, color: STAGE.progressed },
    { label: "Won", value: funnel.won, color: STAGE.won },
  ];
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{s.label}</span>
          <div className="flex-1 h-6 rounded-md bg-muted overflow-hidden">
            <div
              className="h-full rounded-md transition-all duration-500 ease-out"
              style={{
                width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%`,
                background: s.color,
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-bold" style={{ color: s.color }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function RateTile({
  label,
  hint,
  stat,
  icon: Icon,
  color,
}: {
  label: string;
  hint: string;
  stat: RateStat;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${color}15` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">
        {stat.pct}%
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          ({stat.num}/{stat.den})
        </span>
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; stat: RateStat }[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-foreground/80">{r.label}</span>
            <div className="flex-1 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${r.stat.den > 0 ? r.stat.pct : 0}%`,
                  background: STAGE.won,
                }}
              />
            </div>
            <span
              className={cn(
                "w-16 shrink-0 text-right text-xs font-semibold",
                r.stat.den > 0 ? "text-foreground" : "text-muted-foreground/40"
              )}
            >
              {r.stat.den > 0 ? `${r.stat.pct}%` : "—"}
              <span className="ml-1 font-normal text-muted-foreground">
                ({r.stat.num}/{r.stat.den})
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ series }: { series: OutreachAnalytics["timeseries"] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDimensions({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-[200px] w-full">
      {dimensions.width > 0 && (
        <AreaChart
          data={series}
          width={dimensions.width}
          height={dimensions.height}
          margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gradDrafted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STAGE.drafted} stopOpacity={0.5} />
              <stop offset="100%" stopColor={STAGE.drafted} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STAGE.sent} stopOpacity={0.5} />
              <stop offset="100%" stopColor={STAGE.sent} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#71717a" }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
          <Tooltip content={<TrendTooltip />} />
          <Area type="monotone" dataKey="drafted" stroke={STAGE.drafted} strokeWidth={2.5} fill="url(#gradDrafted)" fillOpacity={1} />
          <Area type="monotone" dataKey="sent" stroke={STAGE.sent} strokeWidth={2.5} fill="url(#gradSent)" fillOpacity={1} />
        </AreaChart>
      )}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="text-sm font-semibold text-popover-foreground">
            {entry.dataKey === "drafted" ? "Drafted" : "Sent"}: {entry.value}
          </p>
        ))}
      </div>
    </div>
  );
}
