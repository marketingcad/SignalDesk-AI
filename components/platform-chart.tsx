"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { getPlatformColor } from "@/lib/utils";

interface PlatformData {
  platform: string;
  count: number;
  percentage: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PlatformData }> }) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-popover-foreground">{data.platform}</p>
      <p className="text-xs text-muted-foreground">
        {data.count} leads ({data.percentage}%)
      </p>
    </div>
  );
}

export function PlatformChart() {
  const [mounted, setMounted] = useState(false);
  const [platformBreakdown, setPlatformBreakdown] = useState<PlatformData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Use the server-side aggregate instead of pulling up to 500 full lead rows
    // just to count by platform.
    fetch("/api/dashboard/platform-counts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, { total?: number }> | null) => {
        if (!data) return;
        const platforms = ["Facebook", "LinkedIn", "Reddit", "X"];
        const counts = platforms.map((p) => ({ platform: p, count: data[p]?.total ?? 0 }));
        const total = counts.reduce((a, b) => a + b.count, 0);
        if (total > 0) {
          setPlatformBreakdown(
            counts.map(({ platform, count }) => ({
              platform,
              count,
              percentage: Math.round((count / total) * 100),
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasData = platformBreakdown.length > 0;

  if (mounted && !loading && !hasData) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
        <PieChartIcon className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground/70">No platform data yet</p>
        <p className="text-xs text-muted-foreground">
          Leads will appear here once the scraper collects them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="h-[160px] w-[160px] shrink-0">
        {!mounted || loading ? (
          <div className="h-full w-full animate-pulse rounded-full bg-muted/50" />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={platformBreakdown}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={3}
              dataKey="count"
              strokeWidth={0}
            >
              {platformBreakdown.map((entry) => (
                <Cell
                  key={entry.platform}
                  fill={getPlatformColor(entry.platform)}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        )}
      </div>
      <div className="w-full flex-1 space-y-3">
        {platformBreakdown.map((p) => (
          <div key={p.platform} className="flex items-center gap-3">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: getPlatformColor(p.platform) }}
            />
            <span className="text-sm text-foreground/80 w-20">{p.platform}</span>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${p.percentage}%`,
                    background: getPlatformColor(p.platform),
                  }}
                />
              </div>
            </div>
            <span className="text-sm font-semibold text-foreground w-12 text-right">
              {p.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
