"use client";

import { useState, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { MapPin } from "lucide-react";

export interface GeoDataPoint {
  country: string;
  code: string;
  leads: number;
  highIntent: number;
  percentage: number;
  fill?: string;
}

// Color palette using the project's indigo/purple scale + accent colors
const COUNTRY_COLORS: string[] = [
  "#6366f1", // indigo
  "#8b5cf6", // purple
  "#a78bfa", // violet
  "#34d399", // emerald
  "#f59e0b", // amber
  "#818cf8", // light indigo
  "#c4b5fd", // lavender
  "#71717a", // zinc
];

function getCountryColor(_country: string, index: number) {
  return COUNTRY_COLORS[index % COUNTRY_COLORS.length];
}

// Mock geography data (fallback when API returns empty)
const mockGeoData: GeoDataPoint[] = [
  { country: "United States", code: "US", leads: 112, highIntent: 34, percentage: 45 },
  { country: "United Kingdom", code: "GB", leads: 42, highIntent: 12, percentage: 17 },
  { country: "Canada", code: "CA", leads: 35, highIntent: 9, percentage: 14 },
  { country: "Australia", code: "AU", leads: 28, highIntent: 7, percentage: 11 },
  { country: "Philippines", code: "PH", leads: 18, highIntent: 3, percentage: 7 },
  { country: "India", code: "IN", leads: 12, highIntent: 2, percentage: 5 },
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: GeoDataPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      <div className="flex items-center gap-1.5 mb-1">
        <MapPin className="h-3 w-3 text-muted-foreground" />
        <p className="text-sm font-semibold text-popover-foreground">
          {data.country}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.leads} leads &middot; {data.highIntent} high intent
      </p>
      <p className="text-xs text-muted-foreground">{data.percentage}% of total</p>
    </div>
  );
}

interface GeographyChartProps {
  /** "bar" = horizontal bar chart (default), "breakdown" = compact list style */
  variant?: "bar" | "breakdown";
}

export function GeographyChart({ variant = "bar" }: GeographyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [geoData, setGeoData] = useState<GeoDataPoint[]>(mockGeoData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/geography")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GeoDataPoint[] | null) => {
        if (data && data.length > 0) {
          setGeoData(
            data.map((d, i) => ({ ...d, fill: getCountryColor(d.country, i) }))
          );
        } else {
          setGeoData(
            mockGeoData.map((d, i) => ({ ...d, fill: getCountryColor(d.country, i) }))
          );
        }
      })
      .catch(() => {
        setGeoData(
          mockGeoData.map((d, i) => ({ ...d, fill: getCountryColor(d.country, i) }))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (variant === "breakdown") {
    return (
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-2.5 w-2.5 rounded-full bg-muted shrink-0" />
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="flex-1 h-2 rounded-full bg-muted" />
                <div className="h-3 w-8 rounded bg-muted" />
              </div>
            ))
          : geoData.map((g, i) => (
              <div key={g.country} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-28 shrink-0">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: getCountryColor(g.country, i) }}
                  />
                  <span className="text-sm text-foreground/80 truncate">
                    {g.country}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${g.percentage}%`,
                        background: getCountryColor(g.country, i),
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-foreground w-8 text-right">
                    {g.leads}
                  </span>
                  <span className="text-[11px] text-muted-foreground w-10 text-right">
                    {g.percentage}%
                  </span>
                </div>
              </div>
            ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-70 w-full">
      {loading ? (
        <div className="h-full w-full flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        dimensions.width > 0 && (
          <BarChart
            data={geoData}
            layout="vertical"
            width={dimensions.width}
            height={dimensions.height}
            margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#71717a" }}
            />
            <YAxis
              type="category"
              dataKey="country"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#71717a" }}
              width={90}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
            />
            <Bar
              dataKey="leads"
              radius={[0, 4, 4, 0]}
              maxBarSize={28}
              fill="#6366f1"
            />
          </BarChart>
        )
      )}
    </div>
  );
}
