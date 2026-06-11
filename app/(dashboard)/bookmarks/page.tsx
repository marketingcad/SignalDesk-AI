"use client";

import { useState, useEffect, useCallback } from "react";
import { openUrl } from "@/lib/open-url";
import { Header } from "@/components/header";
import { PlatformBadge } from "@/components/platform-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getPlatformColor, timeAgo } from "@/lib/utils";
import type { Platform } from "@/lib/types";
import {
  Bookmark,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Link2,
  Search,
  Star,
  Pencil,
  Save,
  X,
  Copy,
  Check,
  LayoutGrid,
  List,
  Globe,
  Layers,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

type BookmarkItem = {
  id: string;
  url: string;
  name: string;
  platform: string | null;
  notes: string;
  favorite: boolean;
  createdAt: string;
};

type SortKey = "newest" | "oldest" | "name";

function detectPlatform(url: string): string | null {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/x\.com|twitter\.com/i.test(url)) return "X";
  try { new URL(url); return "Other"; } catch { return null; }
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const [platformFilter, setPlatformFilter] = useState<Platform | "All">("All");
  const [sort, setSort] = useState<SortKey>("newest");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [nowTs, setNowTs] = useState(0);
  const perPage = layout === "grid" ? 24 : 20;

  // New bookmark form
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Restore persisted layout + stamp current time (client-only, keeps render pure)
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("bookmarks:layout") : null;
    if (saved === "grid" || saved === "list") setLayout(saved);
    setNowTs(Date.now());
  }, []);

  const setLayoutPersist = (l: "grid" | "list") => {
    setLayout(l);
    try { window.localStorage.setItem("bookmarks:layout", l); } catch {}
  };

  const fetchBookmarks = useCallback(() => {
    fetch("/api/bookmarks")
      .then((res) => (res.ok ? res.json() : { bookmarks: [] }))
      .then((data) => setBookmarks(data.bookmarks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

  const handleCreate = async () => {
    if (!newUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl,
          name: newName || newUrl,
          platform: detectPlatform(newUrl),
          notes: newNotes,
        }),
      });
      if (res.ok) {
        setNewUrl(""); setNewName(""); setNewNotes("");
        fetchBookmarks();
      }
    } catch {} finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    await fetch("/api/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => fetchBookmarks());
  };

  const startEdit = (b: BookmarkItem) => {
    setEditingId(b.id);
    setEditName(b.name);
    setEditUrl(b.url);
    setEditNotes(b.notes);
  };

  const toggleFavorite = async (b: BookmarkItem) => {
    setBookmarks((prev) => prev.map((bk) => bk.id === b.id ? { ...bk, favorite: !bk.favorite } : bk));
    await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, favorite: !b.favorite }),
    }).catch(() => fetchBookmarks());
  };

  const handleSaveEdit = async (id: string) => {
    if (!editUrl.trim()) return;
    await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: editName || editUrl,
        url: editUrl,
        notes: editNotes,
        platform: detectPlatform(editUrl),
      }),
    });
    setEditingId(null);
    fetchBookmarks();
  };

  const handleCopy = async (b: BookmarkItem) => {
    try {
      await navigator.clipboard.writeText(b.url);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId((c) => (c === b.id ? null : c)), 1500);
    } catch {}
  };

  const favCount = bookmarks.filter((b) => b.favorite).length;
  const platformsUsed = new Set(
    bookmarks.map((b) => b.platform || detectPlatform(b.url) || "Other")
  ).size;
  const weekCount = nowTs
    ? bookmarks.filter((b) => new Date(b.createdAt).getTime() > nowTs - 7 * 86400000).length
    : 0;

  const filtered = bookmarks.filter((b) => {
    if (tab === "favorites" && !b.favorite) return false;
    if (platformFilter !== "All") {
      const p = b.platform || detectPlatform(b.url);
      if (p !== platformFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.notes.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    return b.createdAt.localeCompare(a.createdAt); // newest
  });

  // Platform counts from current view (respects All/Favorites toggle + search)
  const platformCounts = (() => {
    const base = bookmarks.filter((b) => {
      if (tab === "favorites" && !b.favorite) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.notes.toLowerCase().includes(q);
    });
    const map = new Map<string, number>();
    for (const b of base) {
      const p = b.platform || detectPlatform(b.url) || "Other";
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return map;
  })();

  const hasFilters = search.trim().length > 0 || platformFilter !== "All" || tab !== "all";
  const clearFilters = () => { setSearch(""); setPlatformFilter("All"); setTab("all"); setCurrentPage(1); };

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedBookmarks = sorted.slice(
    (safeCurrentPage - 1) * perPage,
    safeCurrentPage * perPage
  );

  const newPlatform = detectPlatform(newUrl);

  // ── KPI cards ──────────────────────────────────────────────
  const stats = [
    { label: "Total", value: bookmarks.length, sub: "saved URLs", icon: Bookmark, accent: "var(--color-primary)" },
    { label: "Favorites", value: favCount, sub: "starred", icon: Star, accent: "#f59e0b" },
    { label: "Platforms", value: platformsUsed, sub: "sources tracked", icon: Layers, accent: "#6366f1" },
    { label: "This week", value: weekCount, sub: "recently added", icon: CalendarPlus, accent: "#10b981" },
  ];

  return (
    <>
      <Header
        title="Bookmarks"
        subtitle={`${bookmarks.length} saved URL${bookmarks.length !== 1 ? "s" : ""}`}
      />
      <div className="p-4 space-y-4 md:p-6">
        {/* KPI overview */}
        {bookmarks.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {stats.map((c, i) => (
              <Card
                key={c.label}
                className={cn(
                  "group relative overflow-hidden border-border bg-card p-4 sm:p-5",
                  "transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 animate-fade-in",
                  i === 1 && "delay-1", i === 2 && "delay-2", i === 3 && "delay-3"
                )}
              >
                <div
                  className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.10] blur-2xl transition-opacity group-hover:opacity-[0.18]"
                  style={{ background: c.accent }}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                    <p className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">{c.value}</p>
                  </div>
                  <div
                    className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in oklab, ${c.accent} 14%, transparent)` }}
                  >
                    <c.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: c.accent }} />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground truncate">{c.sub}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Add New Bookmark */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="relative border-b border-border px-5 py-4 bg-linear-to-br from-primary/8 via-primary/2 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/20 shrink-0">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Save a URL</p>
                <p className="text-xs text-muted-foreground">Bookmark important pages for quick access &amp; scraping</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="https://www.facebook.com/groups/…"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newUrl.trim()) handleCreate(); }}
                  className="h-9 pl-9 pr-24 text-sm bg-secondary/50 border-border"
                />
                {newPlatform && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <PlatformBadge platform={newPlatform as Platform} size="sm" />
                  </div>
                )}
              </div>
              <Input
                placeholder="Name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newUrl.trim()) handleCreate(); }}
                className="h-9 text-sm bg-secondary/50 border-border sm:w-52"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <Input
                placeholder="Notes (optional)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newUrl.trim()) handleCreate(); }}
                className="h-9 text-sm bg-secondary/50 border-border flex-1"
              />
              <Button onClick={handleCreate} disabled={creating || !newUrl.trim()} className="gap-2 h-9 shrink-0">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save Bookmark
              </Button>
            </div>
          </div>
        </Card>

        {/* Toolbar: search + tab + sort + view */}
        {bookmarks.length > 0 && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, URL or notes…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="h-9 pl-9 pr-8 text-sm bg-card border-border"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setCurrentPage(1); }}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* All / Favorites */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shrink-0">
                <button
                  onClick={() => { setTab("all"); setCurrentPage(1); }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    tab === "all" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All ({bookmarks.length})
                </button>
                <button
                  onClick={() => { setTab("favorites"); setCurrentPage(1); }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5",
                    tab === "favorites" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Star className={cn("h-3 w-3", tab === "favorites" && "text-amber-400 fill-amber-400")} />
                  Favorites ({favCount})
                </button>
              </div>

              {/* Sort */}
              <div className="relative shrink-0">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-9 appearance-none rounded-lg border border-border bg-card pl-3 pr-8 text-xs font-medium text-foreground cursor-pointer hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Sort bookmarks"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name (A–Z)</option>
                </select>
                <ChevronDownIcon />
              </div>

              {/* Grid / List */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shrink-0">
                <button
                  onClick={() => setLayoutPersist("grid")}
                  aria-label="Grid view"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-all",
                    layout === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setLayoutPersist("list")}
                  aria-label="List view"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-all",
                    layout === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Platform Filter */}
        {bookmarks.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["All", "Facebook", "LinkedIn", "Reddit", "X", "Other"] as (Platform | "All")[]).map((p) => {
              const isActive = platformFilter === p;
              const count = p === "All"
                ? Array.from(platformCounts.values()).reduce((s, c) => s + c, 0)
                : (platformCounts.get(p) ?? 0);
              const color = p === "All" ? "#8b5cf6" : getPlatformColor(p);
              return (
                <button
                  key={p}
                  onClick={() => { setPlatformFilter(p); setCurrentPage(1); }}
                  className={cn(
                    "flex items-center gap-1.5 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    isActive ? "shadow-sm" : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  )}
                  style={{
                    borderColor: isActive ? `${color}40` : undefined,
                    background: isActive ? `${color}12` : undefined,
                    color: isActive ? color : undefined,
                  }}
                >
                  {p === "All"
                    ? <Globe className="h-3 w-3 shrink-0" />
                    : <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />}
                  {p === "All" ? "All Platforms" : p}
                  <span className={cn("text-[10px] font-bold tabular-nums", isActive ? "opacity-80" : "opacity-50")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Bookmarks */}
        {loading ? (
          <Card className="flex items-center justify-center border-border bg-card py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </Card>
        ) : sorted.length === 0 ? (
          <Card className="flex flex-col items-center justify-center border-border bg-card py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
              <Bookmark className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {bookmarks.length === 0 ? "No bookmarks yet" : "No matching bookmarks"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bookmarks.length === 0 ? "Save your first URL using the form above" : "Try a different search or filter"}
            </p>
            {hasFilters && bookmarks.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 h-8 gap-1.5 text-xs">
                <X className="h-3 w-3" /> Clear filters
              </Button>
            )}
          </Card>
        ) : layout === "grid" ? (
          /* ── GRID VIEW ───────────────────────────────────── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {paginatedBookmarks.map((b) => {
              const isEditing = editingId === b.id;
              const platform = b.platform || detectPlatform(b.url);
              const color = getPlatformColor(platform || "Other");
              if (isEditing) {
                return (
                  <EditCard
                    key={b.id}
                    editName={editName} setEditName={setEditName}
                    editUrl={editUrl} setEditUrl={setEditUrl}
                    editNotes={editNotes} setEditNotes={setEditNotes}
                    onCancel={() => setEditingId(null)}
                    onSave={() => handleSaveEdit(b.id)}
                  />
                );
              }
              return (
                <Card
                  key={b.id}
                  className="group relative flex flex-col overflow-hidden border-border bg-card p-0 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 animate-fade-in"
                >
                  <div className="h-1 w-full shrink-0" style={{ background: color }} />
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${color}18` }}
                        >
                          <Link2 className="h-4 w-4" style={{ color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate" title={b.name}>{b.name}</p>
                          {platform && <PlatformBadge platform={platform as Platform} size="sm" />}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleFavorite(b)}
                        aria-label={b.favorite ? "Unfavorite" : "Favorite"}
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                          b.favorite ? "bg-amber-500/15" : "hover:bg-amber-500/10"
                        )}
                      >
                        <Star className={cn("h-4 w-4 transition-colors", b.favorite ? "text-amber-400 fill-amber-400" : "text-muted-foreground")} />
                      </button>
                    </div>

                    {b.notes ? (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-9">{b.notes}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/40 italic min-h-9">No notes</p>
                    )}

                    <button
                      onClick={() => openUrl(b.url)}
                      title={b.url}
                      className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors min-w-0"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{prettyUrl(b.url)}</span>
                    </button>

                    <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-2.5">
                      <span className="text-[10px] text-muted-foreground" title={new Date(b.createdAt).toLocaleString()}>
                        {nowTs ? timeAgo(new Date(b.createdAt)) : new Date(b.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <IconBtn label={copiedId === b.id ? "Copied" : "Copy URL"} onClick={() => handleCopy(b)}>
                          {copiedId === b.id
                            ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </IconBtn>
                        <IconBtn label="Open" onClick={() => openUrl(b.url)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Edit" onClick={() => startEdit(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Delete" danger onClick={() => handleDelete(b.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          /* ── LIST VIEW ───────────────────────────────────── */
          <div className="space-y-2">
            {paginatedBookmarks.map((b) => {
              const isEditing = editingId === b.id;
              const platform = b.platform || detectPlatform(b.url);
              if (isEditing) {
                return (
                  <EditCard
                    key={b.id}
                    editName={editName} setEditName={setEditName}
                    editUrl={editUrl} setEditUrl={setEditUrl}
                    editNotes={editNotes} setEditNotes={setEditNotes}
                    onCancel={() => setEditingId(null)}
                    onSave={() => handleSaveEdit(b.id)}
                  />
                );
              }
              return (
                <Card key={b.id} className="border-border bg-card p-4 hover:shadow-lg hover:shadow-black/5 transition-all group">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleFavorite(b)}
                      aria-label={b.favorite ? "Unfavorite" : "Favorite"}
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                        b.favorite ? "bg-amber-500/15" : "bg-primary/10 hover:bg-amber-500/10"
                      )}
                    >
                      <Star className={cn("h-5 w-5 transition-colors", b.favorite ? "text-amber-400 fill-amber-400" : "text-primary")} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground truncate">{b.name}</span>
                        {platform && <PlatformBadge platform={platform as Platform} size="sm" />}
                      </div>
                      <button
                        onClick={() => openUrl(b.url)}
                        title={b.url}
                        className="text-[11px] font-mono text-muted-foreground hover:text-primary truncate flex items-center gap-1 transition-colors max-w-full"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-37.5 sm:max-w-62.5 md:max-w-100 lg:max-w-150">{b.url}</span>
                      </button>
                      {b.notes && <p className="text-xs text-muted-foreground/70 mt-1 truncate">{b.notes}</p>}
                    </div>
                    <span className="hidden sm:block text-[10px] text-muted-foreground shrink-0" title={new Date(b.createdAt).toLocaleString()}>
                      {nowTs ? timeAgo(new Date(b.createdAt)) : new Date(b.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconBtn label={copiedId === b.id ? "Copied" : "Copy URL"} onClick={() => handleCopy(b)}>
                        {copiedId === b.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </IconBtn>
                      <IconBtn label="Edit" onClick={() => startEdit(b)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn label="Delete" danger onClick={() => handleDelete(b.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Card className="border-border bg-card px-4 py-3">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(safeCurrentPage - 1) * perPage + 1}–{Math.min(safeCurrentPage * perPage, sorted.length)} of {sorted.length} bookmarks
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(1)}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    if (totalPages <= 7) return true;
                    if (page === 1 || page === totalPages) return true;
                    return Math.abs(page - safeCurrentPage) <= 1;
                  })
                  .reduce<(number | "ellipsis")[]>((acc, page, idx, arr) => {
                    if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "ellipsis" ? (
                      <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
                    ) : (
                      <Button
                        key={item}
                        variant={safeCurrentPage === item ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 p-0 text-xs"
                        onClick={() => setCurrentPage(item)}
                      >
                        {item}
                      </Button>
                    )
                  )}

                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

// ── Small helpers ────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg
      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconBtn({
  children, label, onClick, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        danger ? "hover:text-rose-400 hover:bg-rose-500/10" : "hover:text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function EditCard({
  editName, setEditName,
  editUrl, setEditUrl,
  editNotes, setEditNotes,
  onCancel, onSave,
}: {
  editName: string; setEditName: (v: string) => void;
  editUrl: string; setEditUrl: (v: string) => void;
  editNotes: string; setEditNotes: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="border-primary/30 bg-card p-4 ring-1 ring-primary/10">
      <div className="space-y-2">
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm bg-secondary/50 border-border" placeholder="Name" />
        <div className="relative">
          <Link2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="h-8 pl-8 text-sm font-mono bg-secondary/50 border-border" placeholder="https://…" />
        </div>
        <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-8 text-sm bg-secondary/50 border-border" placeholder="Notes" />
        <div className="flex gap-2 justify-end pt-0.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onCancel}>
            <X className="h-3 w-3" /> Cancel
          </Button>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={onSave} disabled={!editUrl.trim()}>
            <Save className="h-3 w-3" /> Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
