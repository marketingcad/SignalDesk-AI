"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Bell,
  FileBarChart,
  Settings,
  Radio,
  ChevronLeft,
  ChevronRight,
  Zap,
  LogOut,
  Menu,
  X,
  Globe,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { Platform } from "@/lib/types";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AuthTransition } from "@/components/auth-transition";

const ALL_PLATFORMS: Platform[] = ["Facebook", "LinkedIn", "Reddit", "X"];

const baseNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/leads", icon: Users, label: "Leads" },
  { href: "/scrape-url", icon: Globe, label: "Scrape URL" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
  { href: "/reports", icon: FileBarChart, label: "Reports" },
  { href: "/users", icon: UserCog, label: "Users" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onMobileToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, onMobileToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutTransition, setShowLogoutTransition] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [platformStatus, setPlatformStatus] = useState<
    { platform: Platform; enabled: boolean; lastActive: Date | null }[]
  >(ALL_PLATFORMS.map((p) => ({ platform: p, enabled: true, lastActive: null })));

  useEffect(() => {
    // Fetch unread alert count
    fetch("/api/alerts?limit=100")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown[]) => setAlertCount(data.length))
      .catch(() => {});

    // Fetch platform toggles + last active times
    Promise.all([
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/dashboard/platform-counts").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([settings, counts]) => {
        const toggles = settings?.platform_toggles ?? {};
        setPlatformStatus(
          ALL_PLATFORMS.map((p) => ({
            platform: p,
            enabled: toggles[p] ?? true,
            lastActive: counts?.[p]?.lastActive ? new Date(counts[p].lastActive) : null,
          }))
        );
      })
      .catch(() => {});
  }, []);

  // Realtime: auto-increment alert count when new high-intent leads arrive
  useRealtime<{ intent_score: number; platform: string; created_at: string }>({
    table: "leads",
    event: "INSERT",
    onInsert: (newLead) => {
      if (newLead.intent_score >= 70) {
        setAlertCount((prev) => prev + 1);
      }
      // Update platform lastActive
      const platform = newLead.platform as Platform;
      setPlatformStatus((prev) =>
        prev.map((p) =>
          p.platform === platform
            ? { ...p, lastActive: new Date(newLead.created_at) }
            : p
        )
      );
    },
  });

  // Realtime: decrement alert count when leads are deleted
  useRealtime<{ intent_score: number }>({
    table: "leads",
    event: "DELETE",
    onDelete: (oldLead) => {
      if (oldLead.intent_score >= 70) {
        setAlertCount((prev) => Math.max(0, prev - 1));
      }
    },
  });

  const handleLogoutComplete = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  function handleLogout() {
    setShowLogoutTransition(true);
  }

  return (
    <>
    {showLogoutTransition && (
      <AuthTransition type="logout" onComplete={handleLogoutComplete} />
    )}
    {/* Mobile hamburger button — visible only when sidebar is closed on mobile */}
    {!mobileOpen && (
      <button
        onClick={onMobileToggle}
        className="fixed left-3 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar border border-sidebar-border text-sidebar-foreground shadow-md md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    )}

    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        // Desktop: show normally with collapse behavior
        collapsed ? "md:w-[68px]" : "md:w-[260px]",
        // Mobile: slide in/out as overlay
        "w-[260px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden flex-1">
            <h1 className="text-[15px] font-semibold text-sidebar-foreground leading-tight">
              SignalDesk
            </h1>
            <p className="text-[11px] font-medium text-sidebar-primary">AI</p>
          </div>
        )}
        {/* Mobile close button */}
        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {!collapsed && (
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Navigation
          </p>
        )}
        {baseNavItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
              )}
              <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-sidebar-primary")} />
              {!collapsed && (
                <span className="animate-fade-in">{item.label}</span>
              )}
              {!collapsed && item.href === "/alerts" && alertCount > 0 && (
                <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground border-0">
                  {alertCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Platform Status */}
      {!collapsed && (
        <div className="animate-fade-in px-4 py-4">
          <Separator className="mb-4 bg-sidebar-border" />
          <div className="flex items-center gap-2 mb-3">
            <Radio className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Monitoring
            </p>
          </div>
          <div className="space-y-2">
            {platformStatus.map((p) => (
              <div key={p.platform} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      p.enabled ? "bg-emerald-400 animate-pulse-dot" : "bg-muted-foreground/50"
                    )}
                  />
                  <span className="text-xs text-sidebar-foreground">{p.platform}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {p.enabled && p.lastActive ? timeAgo(p.lastActive) : p.enabled ? "Active" : "Off"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sign Out */}
      <div className="px-3 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            collapsed ? "justify-center" : "justify-start gap-3"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="animate-fade-in">Sign out</span>}
        </Button>
      </div>

      {/* Collapse Toggle */}
      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
    </>
  );
}
