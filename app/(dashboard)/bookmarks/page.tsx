"use client";

import { useState, useEffect, useCallback } from "react";
import { openUrl } from "@/lib/open-url";
import { Header } from "@/components/header";
import { PlatformBadge } from "@/components/platform-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function detectPlatform(url: string): string | null {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/x\.com|twitter\.com/i.test(url)) return "X";
  try { new URL(url); return "Other"; } catch { return null; }
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"all" | "favorites">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  // New bookmark form
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");

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
    await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName, notes: editNotes }),
    });
    setEditingId(null);
    fetchBookmarks();
  };

  const favCount = bookmarks.filter((b) => b.favorite).length;

  const filtered = bookmarks.filter((b) => {
    if (viewMode === "favorites" && !b.favorite) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.notes.toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedBookmarks = filtered.slice(
    (safeCurrentPage - 1) * perPage,
    safeCurrentPage * perPage
  );

  return (
    <>
      <Header
        title="Bookmarks"
        subtitle={`${bookmarks.length} saved URL${bookmarks.length !== 1 ? "s" : ""}`}
      />
      <div className="p-4 space-y-4 md:p-6">
        {/* Add New Bookmark */}
        <Card className="border-border bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Star className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Save URL</p>
              <p className="text-xs text-muted-foreground">Bookmark important URLs for quick access</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="https://www.facebook.com/groups/…"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="h-9 pl-9 text-sm bg-secondary/50 border-border"
                />
              </div>
              <Input
                placeholder="Name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 text-sm bg-secondary/50 border-border w-48"
              />
            </div>
            <div className="flex gap-3 items-end">
              <Input
                placeholder="Notes (optional)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="h-9 text-sm bg-secondary/50 border-border flex-1"
              />
              <Button onClick={handleCreate} disabled={creating || !newUrl.trim()} className="gap-2 h-9">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        </Card>

        {/* Toggle + Search */}
        {bookmarks.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <button
                onClick={() => { setViewMode("all"); setCurrentPage(1); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === "all"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({bookmarks.length})
              </button>
              <button
                onClick={() => { setViewMode("favorites"); setCurrentPage(1); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                  viewMode === "favorites"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Star className={`h-3 w-3 ${viewMode === "favorites" ? "text-amber-400 fill-amber-400" : ""}`} />
                Favorites ({favCount})
              </button>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search bookmarks…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="h-9 pl-9 text-sm bg-card border-border"
              />
            </div>
          </div>
        )}

        {/* Bookmarks List */}
        {loading ? (
          <Card className="flex items-center justify-center border-border bg-card py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center justify-center border-border bg-card py-16">
            <Bookmark className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground/70">
              {bookmarks.length === 0 ? "No bookmarks yet" : "No matches"}
            </p>
            <p className="text-xs text-muted-foreground">
              {bookmarks.length === 0 ? "Save your first URL above" : "Try a different search term"}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {paginatedBookmarks.map((b) => {
              const isEditing = editingId === b.id;
              const platform = b.platform || detectPlatform(b.url);
              return (
                <Card
                  key={b.id}
                  className="border-border bg-card p-4 hover:shadow-lg hover:shadow-black/5 transition-all group"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm bg-secondary/50 border-border"
                        placeholder="Name"
                      />
                      <Input
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="h-8 text-sm bg-secondary/50 border-border"
                        placeholder="Notes"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => handleSaveEdit(b.id)}>
                          <Save className="h-3 w-3" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => toggleFavorite(b)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          b.favorite ? "bg-amber-500/15" : "bg-primary/10 hover:bg-amber-500/10"
                        }`}
                      >
                        <Star className={`h-5 w-5 transition-colors ${
                          b.favorite ? "text-amber-400 fill-amber-400" : "text-primary"
                        }`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-foreground truncate">{b.name}</span>
                          {platform && <PlatformBadge platform={platform as Platform} size="sm" />}
                        </div>
                        <button
                          onClick={() => openUrl(b.url)}
                          className="text-[11px] font-mono text-muted-foreground hover:text-primary truncate flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-37.5 sm:max-w-62.5 md:max-w-100 lg:max-w-150">{b.url}</span>
                        </button>
                        {b.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-1 truncate">{b.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-muted-foreground mr-2">
                          {new Date(b.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(b)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                          onClick={() => handleDelete(b.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Card className="border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(safeCurrentPage - 1) * perPage + 1}–{Math.min(safeCurrentPage * perPage, filtered.length)} of {filtered.length} bookmarks
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage(1)}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
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

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                >
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
