"use client";

import { useState, useEffect, useCallback } from "react";
import { openUrl } from "@/lib/open-url";
import { Header } from "@/components/header";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { timeAgo, cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import type { Lead } from "@/lib/types";
import {
  Bell,
  BellOff,
  ExternalLink,
  MessageSquare,
  CheckCheck,
  Archive,
  Trash2,
  Loader2,
} from "lucide-react";

type AlertItem = {
  id: string;
  leadId: string;
  platform: Lead["platform"];
  intentScore: number;
  snippet: string;
  username: string;
  source: string;
  createdAt: Date;
  read: boolean; // true when status !== "New"
  url?: string;
};

function leadToAlert(lead: Lead): AlertItem {
  return {
    id: lead.id,
    leadId: lead.id,
    platform: lead.platform,
    intentScore: lead.intentScore,
    snippet: lead.text?.slice(0, 140) ?? "",
    username: lead.username,
    source: lead.source,
    createdAt: new Date(lead.createdAt),
    read: lead.status !== "New",
    url: lead.url || undefined,
  };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [archived, setArchived] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [tab, setTab] = useState<"all" | "unread" | "archived">("all");
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deletingAll, setDeletingAll] = useState(false);

  // Fetch active alerts
  useEffect(() => {
    fetch("/api/alerts?limit=50")
      .then((res) => (res.ok ? res.json() : null))
      .then((leads: Lead[] | null) => {
        if (leads && leads.length > 0) {
          setAlerts(leads.map(leadToAlert));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch archived alerts when switching to archive tab
  const fetchArchived = useCallback(() => {
    setLoadingArchived(true);
    fetch("/api/alerts?limit=50&archived=true")
      .then((res) => (res.ok ? res.json() : null))
      .then((leads: Lead[] | null) => {
        setArchived(leads ? leads.map(leadToAlert) : []);
      })
      .catch(() => {})
      .finally(() => setLoadingArchived(false));
  }, []);

  useEffect(() => {
    if (tab === "archived") fetchArchived();
  }, [tab, fetchArchived]);

  // Realtime: new high-intent leads appear as alerts instantly
  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "INSERT",
    onInsert: (row) => {
      const score = row.intent_score as number;
      if (score < 70) return;
      const newAlert: AlertItem = {
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

  const unreadCount = alerts.filter((a) => !a.read).length;

  // --- Actions ---

  /** Mark a single alert as read (persists to DB via status change) */
  const markAsRead = useCallback(async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Contacted" }),
      });
    } catch {
      // Optimistic — already updated UI
    }
  }, []);

  /** Mark all alerts as read */
  const markAllRead = useCallback(async () => {
    const unread = alerts.filter((a) => !a.read);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    // Fire all status updates in parallel
    await Promise.allSettled(
      unread.map((a) =>
        fetch(`/api/leads/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Contacted" }),
        })
      )
    );
  }, [alerts]);

  /** Archive a single alert (set status to Dismissed) */
  const archiveAlert = useCallback(async (id: string) => {
    const alert = alerts.find((a) => a.id === id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (alert) setArchived((prev) => [{ ...alert, read: true }, ...prev]);
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Dismissed" }),
      });
    } catch {
      // Revert on failure
      if (alert) {
        setAlerts((prev) => [alert, ...prev]);
        setArchived((prev) => prev.filter((a) => a.id !== id));
      }
    }
  }, [alerts]);

  /** Permanently delete a single archived alert */
  const deleteOne = useCallback(async (id: string) => {
    setDeleting((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (res.ok) {
        setArchived((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // keep in list
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  /** Permanently delete ALL archived alerts */
  const deleteAllArchived = useCallback(async () => {
    if (!confirm("Permanently delete all archived alerts? This cannot be undone.")) return;
    setDeletingAll(true);
    try {
      const res = await fetch("/api/alerts", { method: "DELETE" });
      if (res.ok) {
        setArchived([]);
      }
    } catch {
      // keep list
    } finally {
      setDeletingAll(false);
    }
  }, []);

  // --- Filtered display ---
  const displayed =
    tab === "archived"
      ? archived
      : tab === "unread"
        ? alerts.filter((a) => !a.read)
        : alerts;

  const isArchiveTab = tab === "archived";

  return (
    <>
      <Header
        title="Alerts"
        subtitle={`${unreadCount} unread alert${unreadCount !== 1 ? "s" : ""}`}
      />
      <div className="p-4 space-y-4 md:p-6">
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setTab("all")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                tab === "all"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setTab("unread")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                tab === "unread"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setTab("archived")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                tab === "archived"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1">
                <Archive className="h-3 w-3" />
                Archived ({archived.length})
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!isArchiveTab && unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all as read
              </button>
            )}
            {isArchiveTab && archived.length > 0 && (
              <button
                onClick={deleteAllArchived}
                disabled={deletingAll}
                className="flex items-center gap-1.5 text-xs font-medium text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
              >
                {deletingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete all
              </button>
            )}
          </div>
        </div>

        {/* Alert Cards */}
        <div className="space-y-3">
          {displayed.map((alert, i) => (
            <Card
              key={alert.id}
              className={cn(
                "group relative p-5 transition-all hover:shadow-lg hover:shadow-black/5 animate-fade-in",
                isArchiveTab
                  ? "border-border bg-card opacity-75"
                  : alert.read
                    ? "border-border bg-card"
                    : "border-primary/20 bg-primary/2"
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Unread Indicator */}
              {!alert.read && !isArchiveTab && (
                <div className="absolute left-0 top-5 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
              )}

              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    isArchiveTab
                      ? "bg-muted"
                      : alert.read
                        ? "bg-muted"
                        : "bg-primary/10"
                  )}
                >
                  {isArchiveTab ? (
                    <Archive className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Bell
                      className={cn(
                        "h-5 w-5",
                        alert.read ? "text-muted-foreground" : "text-primary"
                      )}
                    />
                  )}
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
                    Detected in{" "}
                    <span className="font-medium text-foreground/70">
                      {alert.source}
                    </span>
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
                        if (!isArchiveTab) markAsRead(alert.id);
                        if (alert.url) openUrl(alert.url);
                      }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      View Post
                    </Button>

                    {isArchiveTab ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOne(alert.id);
                        }}
                        disabled={deleting[alert.id]}
                        className="ml-auto flex items-center gap-1.5 text-xs font-medium text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
                      >
                        {deleting[alert.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    ) : (
                      <>
                        {!alert.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(alert.id);
                            }}
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <BellOff className="h-3 w-3" />
                            Dismiss
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveAlert(alert.id);
                          }}
                          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Archive className="h-3 w-3" />
                          Archive
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Loading states */}
        {(loading || (isArchiveTab && loadingArchived)) && (
          <Card className="flex flex-col items-center justify-center border-border bg-card py-16">
            <Bell className="h-10 w-10 text-muted-foreground/50 mb-3 animate-pulse" />
            <p className="text-sm font-medium text-foreground/70">
              Loading {isArchiveTab ? "archived " : ""}alerts...
            </p>
          </Card>
        )}

        {/* Empty states */}
        {!loading && !(isArchiveTab && loadingArchived) && displayed.length === 0 && (
          <Card className="flex flex-col items-center justify-center border-border bg-card py-16">
            {isArchiveTab ? (
              <>
                <Archive className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground/70">No archived alerts</p>
                <p className="text-xs text-muted-foreground">
                  Archived alerts will appear here
                </p>
              </>
            ) : (
              <>
                <CheckCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground/70">All caught up!</p>
                <p className="text-xs text-muted-foreground">
                  No {tab === "unread" ? "unread " : ""}alerts at the moment
                </p>
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
