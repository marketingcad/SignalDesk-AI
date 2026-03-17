"use client";

import { useState, useEffect } from "react";
import { openUrl } from "@/lib/open-url";
import { Header } from "@/components/header";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { timeAgo, cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import type { Lead } from "@/lib/types";

type AlertWithUrl = {
  id: string;
  leadId: string;
  platform: Lead["platform"];
  intentScore: number;
  snippet: string;
  username: string;
  source: string;
  createdAt: Date;
  read: boolean;
  url?: string;
};
import {
  Bell,
  BellOff,
  ExternalLink,
  MessageSquare,
  CheckCheck,
} from "lucide-react";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertWithUrl[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/alerts?limit=30")
      .then((res) => (res.ok ? res.json() : null))
      .then((leads: Lead[] | null) => {
        if (leads && leads.length > 0) {
          setAlerts(
            leads.map((lead) => ({
              id: lead.id,
              leadId: lead.id,
              platform: lead.platform,
              intentScore: lead.intentScore,
              snippet: lead.text?.slice(0, 140) ?? "",
              username: lead.username,
              source: lead.source,
              createdAt: new Date(lead.createdAt),
              read: false,
              url: lead.url || undefined,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  // Realtime: new high-intent leads appear as alerts instantly
  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "INSERT",
    onInsert: (row) => {
      const score = row.intent_score as number;
      if (score < 70) return;
      const newAlert: AlertWithUrl = {
        id: row.id as string,
        leadId: row.id as string,
        platform: row.platform as Lead["platform"],
        intentScore: score,
        snippet: ((row.text as string) || "").slice(0, 140),
        username: row.username as string,
        source: row.source as string,
        createdAt: new Date(row.created_at as string),
        read: false,
        url: (row.url as string) || undefined,
      };
      setAlerts((prev) => [newAlert, ...prev]);
    },
  });

  const [filter, setFilter] = useState<"all" | "unread">("all");

  const displayed = filter === "unread" ? alerts.filter((a) => !a.read) : alerts;
  const unreadCount = alerts.filter((a) => !a.read).length;

  const markAsRead = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
  };

  const markAllRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  return (
    <>
      <Header
        title="Alerts"
        subtitle={`${unreadCount} unread alerts`}
      />
      <div className="p-4 space-y-4 md:p-6">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                filter === "all"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                filter === "unread"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Unread ({unreadCount})
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        {/* Alert Cards */}
        <div className="space-y-3">
          {displayed.map((alert, i) => (
            <Card
              key={alert.id}
              className={cn(
                "group relative p-5 transition-all hover:shadow-lg hover:shadow-black/5 animate-fade-in",
                alert.read
                  ? "border-border bg-card"
                  : "border-primary/20 bg-primary/2"
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Unread Indicator */}
              {!alert.read && (
                <div className="absolute left-0 top-5 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
              )}

              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    alert.read ? "bg-muted" : "bg-primary/10"
                  )}
                >
                  <Bell
                    className={cn(
                      "h-5 w-5",
                      alert.read ? "text-muted-foreground" : "text-primary"
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {alert.username}
                    </span>
                    <PlatformBadge platform={alert.platform} size="sm" />
                    <IntentBadge score={alert.intentScore} size="sm" />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {timeAgo(alert.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Detected in <span className="font-medium text-foreground/70">{alert.source}</span>
                  </p>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {alert.snippet}
                  </p>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5 h-7 shadow-sm shadow-primary/25"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(alert.id);
                        if (alert.url) openUrl(alert.url);
                      }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      View Pos
                    </Button>
                    {!alert.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(alert.id);
                        }}
                        className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <BellOff className="h-3 w-3" />
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {loading && (
          <Card className="flex flex-col items-center justify-center border-border bg-card py-16">
            <Bell className="h-10 w-10 text-muted-foreground/50 mb-3 animate-pulse" />
            <p className="text-sm font-medium text-foreground/70">Loading alerts…</p>
          </Card>
        )}

        {!loading && displayed.length === 0 && (
          <Card className="flex flex-col items-center justify-center border-border bg-card py-16">
            <CheckCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground/70">All caught up!</p>
            <p className="text-xs text-muted-foreground">No unread alerts at the moment</p>
          </Card>
        )}
      </div>
    </>
  );
}
