"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { platformBreakdown as mockBreakdown } from "@/lib/mock-data";
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
  const [platformBreakdown, setPlatformBreakdown] = useState<PlatformData[]>(mockBreakdown);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/leads?limit=500")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.leads?.length) return;
        const counts: Record<string, number> = { Facebook: 0, LinkedIn: 0, Reddit: 0, X: 0 };
        for (const lead of data.leads) {
          if (counts[lead.platform] !== undefined) counts[lead.platform]++;
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total > 0) {
          setPlatformBreakdown(
            Object.entries(counts).map(([platform, count]) => ({
              platform,
              count,
              percentage: Math.round((count / total) * 100),
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-6">
      <div className="h-[160px] w-[160px] shrink-0">
        {!mounted ? (
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
      <div className="flex-1 space-y-3">
        {platformBreakdown.map((p) => (
          <div key={p.platform} className="flex items-center gap-3">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: getPlatformColor(p.platform) }}
            />
            <span className="text-sm text-foreground/80 w-20">{p.platform}</span>
            <div className="flex-1">
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
