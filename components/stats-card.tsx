"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accentColor?: string;
}

export function StatsCard({ title, value, change, icon: Icon, accentColor }: StatsCardProps) {
  const isPositive = change >= 0;

  return (
    <Card className="group relative overflow-hidden border-border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
      {/* Accent glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.08] blur-2xl transition-opacity group-hover:opacity-[0.15]"
        style={{ background: accentColor || "var(--color-primary)" }}
      />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${accentColor || "var(--color-primary)"}15` }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: accentColor || "var(--color-primary)" }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
        )}
        <span
          className={cn(
            "text-sm font-medium",
            isPositive ? "text-emerald-500" : "text-destructive"
          )}
        >
          {isPositive ? "+" : ""}
          {change}%
        </span>
        <span className="text-sm text-muted-foreground">vs last week</span>
      </div>
    </Card>
  );
}
