"use client";

import { useState, useEffect } from "react";
import { openUrl } from "@/lib/open-url";
import { Header } from "@/components/header";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { Card } from "@/components/ui/card";
import { cn, getPlatformColor } from "@/lib/utils";
import { GeographyChart } from "@/components/geography-chart";
import type { Platform, DailyReport } from "@/lib/types";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  Flame,
  AlertTriangle,
  MinusCircle,
  ExternalLink,
  Globe,
  Trophy,
  Link2,
  Hash,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "@/lib/types";

type SourceRank = {
  source: string;
  url: string | null;
  platform: string | null;
  totalLeads: number;
  highIntent: number;
  mediumIntent: number;
  lowIntent: number;
  avgScore: number;
};

export default function ReportsPage() {
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [sourceRanks, setSourceRanks] = useState<SourceRank[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(
    dailyReports[0]?.date ?? null
  );

  useEffect(() => {
    fetch("/api/leads?limit=500")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.leads?.length) return;
        const leads: Lead[] = data.leads;

        // Group leads by day into DailyReport format
        const byDay: Record<string, DailyReport> = {};
        for (const lead of leads) {
          const day = new Date(lead.createdAt).toISOString().slice(0, 10);
          if (!byDay[day]) {
            byDay[day] = {
              date: day,
              totalLeads: 0,
              highIntent: 0,
              mediumIntent: 0,
              lowIntent: 0,
              platforms: { Facebook: 0, LinkedIn: 0, Reddit: 0, X: 0, Other: 0 },
              topLeads: [],
            };
          }
          const r = byDay[day];
          r.totalLeads++;
          if (lead.intentLevel === "High") r.highIntent++;
          else if (lead.intentLevel === "Medium") r.mediumIntent++;
          else r.lowIntent++;
          r.platforms[lead.platform as Platform]++;
          if (r.topLeads.length < 3) r.topLeads.push(lead);
        }
        const reports = Object.values(byDay).sort(
          (a, b) => b.date.localeCompare(a.date)
        );
        if (reports.length > 0) {
          setDailyReports(reports);
          setExpandedDate(reports[0].date);
        }

        // Group leads by source URL for ranking
        const bySource: Record<string, { leads: Lead[]; scores: number[] }> = {};
        for (const lead of leads) {
          const src = lead.source || lead.url || "Unknown";
          if (!bySource[src]) bySource[src] = { leads: [], scores: [] };
          bySource[src].leads.push(lead);
          bySource[src].scores.push(lead.intentScore);
        }
        const ranks: SourceRank[] = Object.entries(bySource).map(([source, { leads: srcLeads, scores }]) => {
          const firstUrl = srcLeads.find((l) => l.url)?.url || null;
          const firstPlatform = srcLeads[0]?.platform || null;
          return {
            source,
            url: firstUrl,
            platform: firstPlatform,
            totalLeads: srcLeads.length,
            highIntent: srcLeads.filter((l) => l.intentLevel === "High").length,
            mediumIntent: srcLeads.filter((l) => l.intentLevel === "Medium").length,
            lowIntent: srcLeads.filter((l) => l.intentLevel === "Low").length,
            avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
          };
        });
        ranks.sort((a, b) => b.totalLeads - a.totalLeads || b.highIntent - a.highIntent);
        setSourceRanks(ranks);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Header
        title="Reports"
        subtitle="Daily lead detection summaries"
      />
      <div className="p-4 space-y-4 md:p-6">
        {/* Summary Stats for This Week */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <WeekStat
            label="This Week"
            value={dailyReports.reduce((s, r) => s + r.totalLeads, 0)}
            sub="Total leads"
            icon={FileBarChart}
            color="#6366f1"
          />
          <WeekStat
            label="High Intent"
            value={dailyReports.reduce((s, r) => s + r.highIntent, 0)}
            sub="Leads"
            icon={Flame}
            color="#34d399"
          />
          <WeekStat
            label="Medium Intent"
            value={dailyReports.reduce((s, r) => s + r.mediumIntent, 0)}
            sub="Leads"
            icon={AlertTriangle}
            color="#f59e0b"
          />
          <WeekStat
            label="Low Intent"
            value={dailyReports.reduce((s, r) => s + r.lowIntent, 0)}
            sub="Leads"
            icon={MinusCircle}
            color="#71717a"
          />
        </div>

        {/* Geography Breakdown */}
        <Card className="border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Lead Geography</h2>
              <p className="text-xs text-muted-foreground">Leads by country</p>
            </div>
          </div>
          <GeographyChart variant="breakdown" />
        </Card>

        {/* Group / Source Ranking */}
        {sourceRanks.length > 0 && (
          <Card className="border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Group Ranking</h2>
                <p className="text-xs text-muted-foreground">Top sources by leads and high-intent signals</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-8">
                    <Hash className="h-3 w-3" />
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Platform</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source URL</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Leads</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">High</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Medium</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Low</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {sourceRanks.slice(0, 15).map((rank, i) => {
                  const maxLeads = sourceRanks[0].totalLeads;
                  return (
                    <tr key={rank.source} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      {/* Rank */}
                      <td className="px-5 py-3">
                        <span className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                          i === 0 ? "bg-amber-500/15 text-amber-400" :
                          i === 1 ? "bg-zinc-400/15 text-zinc-400" :
                          i === 2 ? "bg-orange-500/15 text-orange-400" :
                          "bg-muted/50 text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                      </td>
                      {/* Platform */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {rank.platform && <PlatformBadge platform={rank.platform as Platform} size="sm" />}
                          <span className="text-xs text-muted-foreground">
                            {rank.platform === "Other" ? "Web" : rank.platform}
                          </span>
                        </div>
                      </td>
                      {/* Source URL */}
                      <td className="px-4 py-3 max-w-xs">
                        <div className="min-w-0">
                          <button
                            onClick={() => rank.url && openUrl(rank.url)}
                            className={cn(
                              "group/link text-[12px] font-mono truncate flex items-center gap-1.5 transition-colors",
                              rank.url ? "text-primary/80 hover:text-primary cursor-pointer" : "text-muted-foreground cursor-default"
                            )}
                          >
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover/link:opacity-100 transition-opacity" />
                            <span className="truncate underline decoration-primary/30 underline-offset-2 group-hover/link:decoration-primary/60">{rank.source}</span>
                          </button>
                          {/* Mini progress bar */}
                          <div className="h-1 mt-1.5 rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all"
                              style={{ width: `${(rank.totalLeads / maxLeads) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      {/* Leads */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold text-foreground">{rank.totalLeads}</span>
                      </td>
                      {/* High */}
                      <td className="px-4 py-3 text-center">
                        {rank.highIntent > 0 ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                            {rank.highIntent}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">0</span>
                        )}
                      </td>
                      {/* Medium */}
                      <td className="px-4 py-3 text-center">
                        {rank.mediumIntent > 0 ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 rounded-full h-5 border-amber-500/30 bg-amber-500/10 text-amber-400">
                            {rank.mediumIntent}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">0</span>
                        )}
                      </td>
                      {/* Low */}
                      <td className="px-4 py-3 text-center">
                        {rank.lowIntent > 0 ? (
                          <span className="text-xs text-muted-foreground">{rank.lowIntent}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">0</span>
                        )}
                      </td>
                      {/* Avg Score */}
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "text-xs font-semibold",
                          rank.avgScore >= 70 ? "text-emerald-400" :
                          rank.avgScore >= 40 ? "text-amber-400" :
                          "text-muted-foreground"
                        )}>
                          {rank.avgScore}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Daily Reports */}
        <div className="space-y-3">
          {dailyReports.map((report) => {
            const isExpanded = expandedDate === report.date;
            const dateObj = new Date(report.date + "T00:00:00");
            const dayLabel = new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            }).format(dateObj);
            const prevReport = dailyReports.find(
              (r) =>
                new Date(r.date + "T00:00:00").getTime() ===
                dateObj.getTime() - 86400000
            );
            const change = prevReport
              ? ((report.totalLeads - prevReport.totalLeads) /
                  prevReport.totalLeads) *
                100
              : 0;

            return (
              <Card
                key={report.date}
                className="border-border bg-card overflow-hidden transition-all p-0"
              >
                {/* Report Header */}
                <button
                  onClick={() =>
                    setExpandedDate(isExpanded ? null : report.date)
                  }
                  className="flex w-full items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {dayLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {report.totalLeads} leads detected
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden sm:flex items-center gap-4">
                      <MiniStat
                        label="High"
                        value={report.highIntent}
                        color="text-emerald-400"
                      />
                      <MiniStat
                        label="Medium"
                        value={report.mediumIntent}
                        color="text-amber-400"
                      />
                      <MiniStat
                        label="Low"
                        value={report.lowIntent}
                        color="text-zinc-400"
                      />
                    </div>
                    {prevReport && (
                      <div className="flex items-center gap-1">
                        {change >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                        )}
                        <span
                          className={cn(
                            "text-xs font-medium",
                            change >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {change >= 0 ? "+" : ""}
                          {change.toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-5 animate-fade-in">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {/* Platform Breakdown */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Platform Breakdown
                        </p>
                        <div className="space-y-3">
                          {(
                            Object.entries(report.platforms) as [
                              Platform,
                              number,
                            ][]
                          ).map(([platform, count]) => (
                            <div
                              key={platform}
                              className="flex items-center gap-3"
                            >
                              <PlatformBadge platform={platform} size="sm" />
                              <div className="flex-1">
                                <div className="h-2 w-full rounded-full bg-muted">
                                  <div
                                    className="h-2 rounded-full transition-all"
                                    style={{
                                      width: `${
                                        (count / report.totalLeads) * 100
                                      }%`,
                                      background:
                                        getPlatformColor(platform),
                                    }}
                                  />
                                </div>
                              </div>
                              <span className="text-sm font-semibold text-foreground w-8 text-right">
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top Leads */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Top Leads
                        </p>
                        <div className="space-y-2">
                          {report.topLeads.map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => lead.url && openUrl(lead.url)}
                              className="flex items-center gap-3 rounded-lg border border-border bg-accent/30 px-3 py-2.5 transition-colors hover:bg-accent/50 hover:border-primary/30 cursor-pointer group w-full text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {lead.username}
                                  </p>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {lead.text.slice(0, 80)}...
                                </p>
                              </div>
                              <IntentBadge
                                score={lead.intentScore}
                                size="sm"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

function WeekStat({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: `${color}15` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <p className={cn("text-sm font-bold", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
