"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Search, Sparkles, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatarMenu } from "@/components/user-avatar-menu";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import type { Lead } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAskAi } from "@/components/ask-ai-context";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const router = useRouter();
  const { askAiOpen, toggleAskAi } = useAskAi();
  const [alertCount, setAlertCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/alerts?limit=100")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown[]) => setAlertCount(data.length))
      .catch(() => {});
  }, []);

  // Global "/" shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !searchOpen && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && searchOpen) {
        closeSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    if (searchOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedIndex(-1);
  }

  const fetchResults = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    fetch(`/api/leads?search=${encodeURIComponent(query)}&limit=6`)
      .then((res) => (res.ok ? res.json() : { leads: [] }))
      .then((data) => {
        const leads = (data.leads || []).map((l: Record<string, unknown>) => ({
          ...l,
          createdAt: new Date(l.createdAt as string),
        }));
        setSearchResults(leads);
      })
      .catch(() => setSearchResults([]))
      .finally(() => setIsSearching(false));
  }, []);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    setSelectedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value), 250);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0 && searchResults[selectedIndex]) {
      e.preventDefault();
      navigateToLead(searchResults[selectedIndex]);
    } else if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      router.push(`/leads?search=${encodeURIComponent(searchQuery)}`);
      closeSearch();
    }
  }

  function navigateToLead(lead: Lead) {
    closeSearch();
    router.push(`/leads?search=${encodeURIComponent(lead.username)}`);
  }

  // Realtime: update badge when new high-intent leads arrive or leads are deleted
  useRealtime<{ intent_score: number }>({
    table: "leads",
    event: "INSERT",
    onInsert: (row) => {
      if (row.intent_score >= 70) setAlertCount((prev) => prev + 1);
    },
  });

  useRealtime<{ intent_score: number }>({
    table: "leads",
    event: "DELETE",
    onDelete: (row) => {
      if (row.intent_score >= 70) setAlertCount((prev) => Math.max(0, prev - 1));
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 pl-14 pr-4 backdrop-blur-xl md:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Ask AI */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAskAi}
          className={cn(
            "gap-2 font-medium",
            askAiOpen && "bg-primary/10 text-primary border-primary/30"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ask AI</span>
        </Button>
        {/* Search */}
        <div ref={searchContainerRef} className="relative">
          {!searchOpen ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search leads...</span>
              <kbd className="ml-2 hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                /
              </kbd>
            </Button>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search leads by name, text, source..."
                className="h-9 w-56 pl-8 pr-8 sm:w-72"
              />
              {searchQuery && (
                <button
                  onClick={closeSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Search Results Dropdown */}
          {searchOpen && searchQuery.trim() && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg sm:w-96">
              {isSearching ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-sm text-muted-foreground">
                  <Search className="mb-2 h-5 w-5 opacity-40" />
                  No leads found for &quot;{searchQuery}&quot;
                </div>
              ) : (
                <>
                  <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                    {searchResults.length} result{searchResults.length !== 1 && "s"} found
                  </div>
                  <ul className="max-h-80 overflow-y-auto">
                    {searchResults.map((lead, index) => (
                      <li key={lead.id}>
                        <button
                          className={cn(
                            "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                            selectedIndex === index && "bg-muted/50"
                          )}
                          onClick={() => navigateToLead(lead)}
                          onMouseEnter={() => setSelectedIndex(index)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {lead.username}
                            </span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <PlatformBadge platform={lead.platform} />
                              <IntentBadge score={lead.intentScore} />
                            </div>
                          </div>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {lead.text}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                            <span>{lead.source}</span>
                            <span>&middot;</span>
                            <span>{timeAgo(lead.createdAt)}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="flex w-full items-center justify-center gap-1 border-t border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-muted/50"
                    onClick={() => {
                      router.push(`/leads?search=${encodeURIComponent(searchQuery)}`);
                      closeSearch();
                    }}
                  >
                    View all results
                    <Search className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {/* Notifications */}
        <Link href="/alerts">
         <Button variant="outline" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {alertCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground border-0">
              {alertCount}
            </Badge>
          )}
        </Button></Link>
        {/* Theme Toggle */}
        <ThemeToggle />
        {/* User Avatar */}
        <UserAvatarMenu />
        {/* Actions */}
        {actions}
      </div>
    </header>
  );
}

export function ActionButton({
  children,
  variant = "primary",
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Button
      onClick={onClick}
      variant={variant === "primary" ? "default" : "outline"}
      size="sm"
      className={cn(
        "gap-2",
        variant === "primary" && "shadow-sm shadow-primary/25"
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Button>
  );
}
