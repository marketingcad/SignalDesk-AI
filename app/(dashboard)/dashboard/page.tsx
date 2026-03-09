"use client";

import { Header } from "@/components/header";
import { StatsCard } from "@/components/stats-card";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { StatusBadge } from "@/components/status-badge";
import { LeadChart } from "@/components/lead-chart";
import { PlatformChart } from "@/components/platform-chart";
import { GeographyChart } from "@/components/geography-chart";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/use-api";
import { timeAgo } from "@/lib/utils";
import type { Lead, DashboardStats } from "@/lib/types";
import {
  Users,
  Flame,
  Target,
  Gauge,
  ArrowUpRight,
  Activity,
  Globe,
} from "lucide-react";

export default function DashboardPage() {
  const { data: stats } = useApi<DashboardStats>(
    "/api/dashboard/stats",
    {
      totalLeads: 0,
      highIntentLeads: 0,
      avgIntentScore: 0,
      responseRate: 0,
      totalLeadsChange: 0,
      highIntentChange: 0,
      avgScoreChange: 0,
      responseRateChange: 0,
    }
  );
  const { data: leadsResponse } = useApi<{ leads: Lead[]; count: number }>(
    "/api/leads?intentLevel=High&limit=5",
    { leads: [], count: 0 }
  );
  const { data: alertLeads } = useApi<Lead[]>(
    "/api/alerts?limit=4",
    []
  );

  const dashboardStats = stats;
  const recentLeads = leadsResponse.leads?.slice(0, 5) ?? [];
  const recentAlerts = (alertLeads ?? []).slice(0, 4).map((lead) => ({
    id: lead.id,
    leadId: lead.id,
    platform: lead.platform,
    intentScore: lead.intentScore,
    snippet: lead.text?.slice(0, 140) ?? "",
    username: lead.username,
    source: lead.source,
    createdAt: lead.createdAt,
    read: false,
  }));

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Real-time lead intelligence overview"
      />
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Total Leads"
            value={dashboardStats.totalLeads}
            change={dashboardStats.totalLeadsChange}
            icon={Users}
            accentColor="#6366f1"
          />
          <StatsCard
            title="High Intent"
            value={dashboardStats.highIntentLeads}
            change={dashboardStats.highIntentChange}
            icon={Flame}
            accentColor="#34d399"
          />
          <StatsCard
            title="Avg. Score"
            value={dashboardStats.avgIntentScore}
            change={dashboardStats.avgScoreChange}
            icon={Target}
            accentColor="#f59e0b"
          />
          <StatsCard
            title="Response Rate"
            value={`${dashboardStats.responseRate}%`}
            change={dashboardStats.responseRateChange}
            icon={Gauge}
            accentColor="#8b5cf6"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Lead Trend Chart */}
          <Card className="xl:col-span-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Lead Trend</h2>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-xs text-muted-foreground">Total</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">High Intent</span>
                </div>
              </div>
            </div>
            <LeadChart />
          </Card>

          {/* Platform Breakdown */}
          <Card className="border-border bg-card p-5">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-foreground">Platform Sources</h2>
              <p className="text-xs text-muted-foreground">Distribution by platform</p>
            </div>
            <PlatformChart />
          </Card>
        </div>

        {/* Geography Row */}
        <Card className="border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Lead Geography</h2>
                <p className="text-xs text-muted-foreground">Distribution by country</p>
              </div>
            </div>
          </div>
          <GeographyChart variant="bar" />
        </Card>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* High Intent Leads */}
          <Card className="xl:col-span-2 border-border bg-card p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-foreground">High-Intent Leads</h2>
              </div>
              <a
                href="/leads"
                className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            <div className="divide-y divide-border">
              {recentLeads.map((lead, i) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/50 animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {lead.username}
                      </span>
                      <PlatformBadge platform={lead.platform} size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {lead.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <IntentBadge score={lead.intentScore} size="sm" />
                    <StatusBadge status={lead.status} />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {timeAgo(lead.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Live Activity Feed */}
          <Card className="border-border bg-card p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Live Activity</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                <span className="text-[11px] text-emerald-400 font-medium">Live</span>
              </div>
            </div>
            <div className="divide-y divide-border">
              {recentAlerts.map((alert, i) => (
                <div
                  key={alert.id}
                  className="px-5 py-3.5 animate-slide-in"
                  style={{ animationDelay: `${i * 75}ms` }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <PlatformBadge platform={alert.platform} size="sm" />
                    <IntentBadge score={alert.intentScore} size="sm" />
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {timeAgo(alert.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                    <span className="font-medium text-foreground">
                      {alert.username}
                    </span>{" "}
                    in {alert.source}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                    {alert.snippet}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
