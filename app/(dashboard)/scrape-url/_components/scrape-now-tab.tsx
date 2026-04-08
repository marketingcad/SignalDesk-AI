"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { isTauri, launchAuthLogin } from "@/lib/tauri";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Globe, Link2, Search, Loader2, AlertTriangle, CheckCircle2,
  ArrowRight, FileSearch, Layers, Clock, Sparkles, Hash,
  Plus, Trash2, ChevronRight, LogIn, Bookmark,
} from "lucide-react";

import { PlatformBadge } from "./platform-badge";
import { UrlResultRow } from "./url-result-row";
import type { UrlItemResult, MultiScrapeResponse, HistoryEntry, BookmarkEntry } from "./shared";
import {
  detectPlatform, formatHistoryTs, groupByDate,
  PLATFORM_META, PLATFORM_EXAMPLES,
} from "./shared";

export function ScrapeNowTab({
  urls, setUrls,
  loading, setLoading,
  results, setResults,
  totals, setTotals,
  scrapeError, setScrapeError,
  history, setHistory,
  historyLoading,
  deletingSessionId,
  savedBookmarks,
  bookmarkedUrls,
  openBookmarkModal,
  clearAllHistory,
  clearingHistory,
  deleteSession,
}: {
  urls: string[];
  setUrls: React.Dispatch<React.SetStateAction<string[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  results: UrlItemResult[];
  setResults: React.Dispatch<React.SetStateAction<UrlItemResult[]>>;
  totals: { inserted: number; found: number; dupes: number } | null;
  setTotals: React.Dispatch<React.SetStateAction<{ inserted: number; found: number; dupes: number } | null>>;
  scrapeError: string | null;
  setScrapeError: React.Dispatch<React.SetStateAction<string | null>>;
  history: HistoryEntry[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>;
  historyLoading: boolean;
  deletingSessionId: string | null;
  savedBookmarks: BookmarkEntry[];
  bookmarkedUrls: Set<string>;
  openBookmarkModal: (url: string) => void;
  clearAllHistory: () => Promise<void>;
  clearingHistory: boolean;
  deleteSession: (id: string) => Promise<void>;
}) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => { setIsDesktop(isTauri()); }, []);

  const addUrl = () => setUrls((p) => [...p, ""]);
  const removeUrl = (i: number) =>
    setUrls((p) => (p.length === 1 ? [""] : p.filter((_, j) => j !== i)));
  const updateUrl = (i: number, v: string) =>
    setUrls((p) => p.map((u, j) => (j === i ? v : u)));

  const validUrlCount = urls.filter((u) => u.trim()).length;

  const doScrape = useCallback(async (targetUrls?: string[]) => {
    const validUrls = (targetUrls ?? urls).map((u) => u.trim()).filter(Boolean);
    if (!validUrls.length || loading) return;
    setLoading(true);
    if (!targetUrls) {
      setResults([]);
      setTotals(null);
    }
    setScrapeError(null);
    try {
      const res = await fetch("/api/leads/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls }),
      });
      const data: MultiScrapeResponse = await res.json();
      if (!res.ok || data.error) {
        setScrapeError(data.error || "Scrape failed");
      } else {
        const items = data.items ?? [];
        if (targetUrls) {
          // Retry: merge new results into existing
          setResults((prev) => {
            const urlSet = new Set(items.map((i) => i.url));
            return [...prev.filter((r) => !urlSet.has(r.url)), ...items];
          });
          setTotals((prev) => prev ? {
            inserted: prev.inserted + (data.totalInserted ?? 0),
            found: prev.found + (data.totalPostsFound ?? 0),
            dupes: prev.dupes + (data.totalDuplicates ?? 0),
          } : {
            inserted: data.totalInserted ?? 0,
            found: data.totalPostsFound ?? 0,
            dupes: data.totalDuplicates ?? 0,
          });
        } else {
          setResults(items);
          setTotals({ inserted: data.totalInserted ?? 0, found: data.totalPostsFound ?? 0, dupes: data.totalDuplicates ?? 0 });
        }
        const loginErrors = items.filter((i) => {
          const err = (i.error ?? i.errors?.[0] ?? "").toLowerCase();
          return err.includes("requires login");
        });
        if (loginErrors.length > 0) {
          const platforms = loginErrors.map((i) => i.platform).filter(Boolean).join(", ");
          setScrapeError(`${platforms || "Platform"} requires login. Click "Open Login" to authenticate.`);
        }
        setHistory((prev) => [
          ...items.map((item) => ({
            url: item.url, platform: item.platform ?? undefined,
            postsFound: item.postsFound ?? 0, inserted: item.batch?.inserted ?? 0,
            duplicates: item.batch?.duplicates ?? 0, timestamp: new Date(),
            error: item.error ?? item.errors?.[0],
          })),
          ...prev,
        ]);
      }
    } catch {
      setScrapeError("Could not reach scraper service");
    } finally {
      setLoading(false);
    }
  }, [urls, loading, setLoading, setResults, setTotals, setScrapeError, setHistory]);

  const handleRetry = (url: string) => doScrape([url]);


  // Failed results for retry-all
  const failedResults = results.filter((r) => !r.success || !!r.error);

  // Group history by date
  const historyGroups = groupByDate(history);

  return (
    <div className="space-y-4">
      {/* URL input card */}
      <Card className="border-border bg-card">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Paste URLs to scrape</p>
              <p className="text-xs text-muted-foreground">
                Add one or more URLs — mix platforms in the same run
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {urls.map((urlVal, idx) => {
              const platform = detectPlatform(urlVal);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="url"
                      placeholder="https://www.facebook.com/groups/…"
                      value={urlVal}
                      onChange={(e) => updateUrl(idx, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") doScrape(); }}
                      className="pl-9 pr-32 bg-secondary/50 border-border h-10 text-sm"
                      disabled={loading}
                    />
                    {platform && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <PlatformBadge platform={platform} />
                      </div>
                    )}
                  </div>
                  {urls.length > 1 && (
                    <button
                      onClick={() => removeUrl(idx)}
                      disabled={loading}
                      className="h-10 w-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addUrl} disabled={loading} className="gap-1.5 text-xs h-8">
              <Plus className="h-3.5 w-3.5" />
              Add URL
            </Button>
            <div className="flex-1" />
            <Button onClick={() => doScrape()} disabled={loading || validUrlCount === 0} className="gap-2 px-5 h-10">
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Scraping {validUrlCount} URL{validUrlCount !== 1 ? "s" : ""}…</>
              ) : (
                <><Search className="h-4 w-4" />Scrape {validUrlCount > 1 ? `${validUrlCount} URLs` : "URL"}</>
              )}
            </Button>
          </div>

          {loading && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Scraping in progress…</p>
                <p className="text-xs text-muted-foreground">URLs are processed sequentially. May take a few minutes.</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Error */}
      {scrapeError && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-rose-400">Scrape failed</p>
              <p className="text-xs text-rose-400/80">{scrapeError}</p>
            </div>
          </div>
          {scrapeError.toLowerCase().includes("requires login") && isDesktop && (
            <button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try { await launchAuthLogin(); } catch (err) { console.error("[scrape-url] Auth launch failed:", err); }
              }}
              className="self-start flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <LogIn className="h-4 w-4" /> Open Browser Login
            </button>
          )}
        </div>
      )}

      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Posts Found", value: totals.found,    icon: FileSearch, cls: "bg-primary/10 text-primary" },
            { label: "New Leads",   value: totals.inserted, icon: Sparkles,   cls: "bg-emerald-500/10 text-emerald-400" },
            { label: "Duplicates",  value: totals.dupes,    icon: Layers,     cls: "bg-amber-500/10 text-amber-400" },
          ].map((s) => (
            <Card key={s.label} className="border-border bg-card p-4 flex items-center gap-3">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", s.cls)}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
                <p className="text-xl font-bold text-foreground leading-tight">{s.value}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Results + History grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Results */}
        <div className="space-y-3">
          {results.length > 0 ? (
            <Card className="border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-foreground">Results</span>
                  <Badge variant="secondary" className="text-[10px]">{results.length} URL{results.length !== 1 ? "s" : ""}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {failedResults.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => doScrape(failedResults.map((r) => r.url))}
                      disabled={loading}
                      className="h-7 gap-1.5 text-[11px] text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <Loader2 className={cn("h-3 w-3", loading && "animate-spin")} />
                      Retry {failedResults.length} Failed
                    </Button>
                  )}
                  <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                    View Leads <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-130 overflow-y-auto">
                {results.map((item, idx) => (
                  <UrlResultRow key={idx} item={item} index={idx} onRetry={handleRetry} />
                ))}
              </div>
            </Card>
          ) : (
            <Card className="border-border bg-card">
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Supported Platforms</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLATFORM_EXAMPLES.map((p) => {
                    const meta = PLATFORM_META[p.name];
                    return (
                      <div key={p.name} className={cn("rounded-lg border p-3 space-y-2", meta.bg, meta.border)}>
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                          <span className={cn("text-xs font-semibold", meta.color)}>{p.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{p.tip}</p>
                        {p.examples.map((ex) => (
                          <button key={ex} onClick={() => setUrls([ex])} className="flex w-full items-center gap-1.5 text-left group/ex">
                            <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-[11px] text-muted-foreground group-hover/ex:text-foreground truncate transition-colors">{ex}</span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/ex:opacity-100 shrink-0 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* History */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Scrape History</span>
              {history.length > 0 && <Badge variant="secondary" className="text-[10px]">{history.length}</Badge>}
            </div>
            <div className="flex items-center gap-1">
              {history.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-rose-400"
                      disabled={clearingHistory}
                    >
                      {clearingHistory ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                      Clear All
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all scrape history?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all {history.length} history {history.length === 1 ? "entry" : "entries"}. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={clearAllHistory}
                        className="bg-rose-600 text-white hover:bg-rose-700"
                      >
                        Clear All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                <Globe className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">No scrapes yet</p>
                <p className="text-xs text-muted-foreground mt-1">Paste a URL above and hit Scrape to get started</p>
              </div>
            </div>
          ) : (
            <div className="max-h-130 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              {historyGroups.map((group) => (
                <div key={group.label}>
                  {/* Date group header */}
                  <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border px-4 py-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((entry, idx) => (
                      <div key={entry.id ?? idx} className="px-4 py-3 space-y-1.5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => { setUrls([entry.url]); }}
                            className="text-[11px] text-primary hover:text-primary/80 hover:underline text-left truncate transition-colors"
                            title={entry.url}
                          >
                            {entry.url}
                          </button>
                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            {bookmarkedUrls.has(entry.url) && (
                              <Badge variant="outline" className="text-[9px] px-1.5 h-4 rounded-full border-amber-500/30 bg-amber-500/10 text-amber-400 gap-0.5">
                                <Bookmark className="h-2.5 w-2.5 fill-amber-400" />
                                Saved
                              </Badge>
                            )}
                            {entry.error
                              ? <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                            <button
                              onClick={() => openBookmarkModal(entry.url)}
                              className="p-0.5 rounded hover:bg-amber-500/10 text-muted-foreground/40 hover:text-amber-400 transition-colors"
                              title="Save to bookmarks"
                            >
                              <Bookmark className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => entry.id && deleteSession(entry.id)}
                              disabled={deletingSessionId === entry.id}
                              className="p-0.5 rounded hover:bg-rose-500/10 text-muted-foreground/40 hover:text-rose-400 transition-colors"
                              title="Delete this entry"
                            >
                              {deletingSessionId === entry.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Trash2 className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                        {entry.error ? (
                          <p className="text-[10px] text-rose-400 line-clamp-2">{entry.error}</p>
                        ) : (
                          <div className="flex flex-wrap gap-x-3">
                            {entry.platform && <PlatformBadge platform={entry.platform} />}
                            <span className="text-[10px] text-foreground font-medium">{entry.postsFound} posts</span>
                            <span className="text-[10px] text-emerald-400">+{entry.inserted} leads</span>
                            {entry.duplicates > 0 && <span className="text-[10px] text-muted-foreground">{entry.duplicates} dupes</span>}
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground/60">{formatHistoryTs(entry.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
