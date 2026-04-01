"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Link2, Loader2, AlertTriangle,
  Plus, Trash2, Pencil, Save, Bookmark, Star, CheckCircle2,
} from "lucide-react";
import { PlatformBadge } from "./platform-badge";
import { CronPicker } from "./schedules-tab";
import type { EditSchedState, BookmarkEntry } from "./shared";
import { detectPlatform } from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// Edit Schedule Modal
// ─────────────────────────────────────────────────────────────────────────────

export function EditScheduleModal({
  editSched, setEditSched,
  editSaving, editError,
  savedBookmarks,
  onSave,
  onOpenBmPicker,
}: {
  editSched: EditSchedState | null;
  setEditSched: React.Dispatch<React.SetStateAction<EditSchedState | null>>;
  editSaving: boolean;
  editError: string | null;
  savedBookmarks: BookmarkEntry[];
  onSave: () => Promise<void>;
  onOpenBmPicker: (target: "create" | "edit") => void;
}) {
  return (
    <Dialog open={!!editSched} onOpenChange={(open) => { if (!open) setEditSched(null); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit Schedule
          </DialogTitle>
          <DialogDescription>Update the schedule details below and save.</DialogDescription>
        </DialogHeader>

        {editSched && (
          <div className="space-y-5 py-2 flex-1 min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Schedule Name <span className="text-rose-400">*</span>
              </label>
              <Input
                value={editSched.name}
                onChange={(e) => setEditSched((s) => s && ({ ...s, name: e.target.value }))}
                className="h-9 text-sm bg-secondary/50 border-border"
              />
            </div>

            {/* URLs */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Target URL{editSched.urls.length > 1 ? "s" : ""} <span className="text-rose-400">*</span>
              </label>
              <div className={cn("space-y-2", editSched.urls.length > 5 && "max-h-52 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border")}>
                {editSched.urls.map((urlVal, idx) => {
                  const platform = detectPlatform(urlVal);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://www.facebook.com/groups/…"
                          value={urlVal}
                          onChange={(e) => setEditSched((s) => {
                            if (!s) return s;
                            const urls = [...s.urls];
                            urls[idx] = e.target.value;
                            return { ...s, urls };
                          })}
                          className="h-9 pl-9 pr-28 text-sm bg-secondary/50 border-border"
                        />
                        {platform && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <PlatformBadge platform={platform} />
                          </div>
                        )}
                      </div>
                      {editSched.urls.length > 1 && (
                        <button
                          onClick={() => setEditSched((s) => {
                            if (!s) return s;
                            const urls = s.urls.filter((_, i) => i !== idx);
                            return { ...s, urls };
                          })}
                          className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditSched((s) => s && ({ ...s, urls: [...s.urls, ""] }))}
                  className="gap-1.5 text-xs h-7"
                >
                  <Plus className="h-3 w-3" />
                  Add URL
                </Button>
                {savedBookmarks.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenBmPicker("edit")}
                    className="gap-1.5 text-xs h-7"
                  >
                    <Bookmark className="h-3 w-3" />
                    From Bookmarks
                  </Button>
                )}
                {editSched.urls.filter((u) => u.trim()).length > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    {editSched.urls.filter((u) => u.trim()).length} URLs — one schedule per URL
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {editSched.urls.filter((u) => u.trim()).length > 1
                  ? "Each URL will create a separate schedule with the same frequency"
                  : "The page that will be scraped automatically"}
              </p>
            </div>

            <Separator />

            {/* Frequency */}
            <CronPicker
              cron={editSched.cron}
              customMode={editSched.customMode}
              customMinutes={editSched.customMinutes}
              customHours={editSched.customHours}
              customTime={editSched.customTime}
              customDays={editSched.customDays}
              customCron={editSched.customCron}
              onChange={(updates) => setEditSched((s) => s && ({ ...s, ...updates }))}
            />

            <Separator />

            {/* Auto-scrape toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Auto-scrape</p>
                <p className="text-[11px] text-muted-foreground">Begin auto-scraping as soon as saved</p>
              </div>
              <button
                onClick={() => setEditSched((s) => s && ({ ...s, status: s.status === "active" ? "paused" : "active" }))}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none",
                  editSched.status === "active" ? "bg-primary" : "bg-muted"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  editSched.status === "active" ? "translate-x-4.5" : "translate-x-0.5"
                )} />
              </button>
            </div>

            {/* Error */}
            {editError && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <p className="text-xs text-rose-400">{editError}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => setEditSched(null)} className="h-9">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={editSaving} className="gap-2 h-9">
            {editSaving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              : <><Save className="h-4 w-4" />Save Changes</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Bookmark Modal
// ─────────────────────────────────────────────────────────────────────────────

export function SaveBookmarkModal({
  bookmarkModal,
  setBookmarkModal,
  bmName, setBmName,
  bmNotes, setBmNotes,
  bmSaving,
  onSave,
}: {
  bookmarkModal: { url: string; platform: string | null } | null;
  setBookmarkModal: React.Dispatch<React.SetStateAction<{ url: string; platform: string | null } | null>>;
  bmName: string;
  setBmName: React.Dispatch<React.SetStateAction<string>>;
  bmNotes: string;
  setBmNotes: React.Dispatch<React.SetStateAction<string>>;
  bmSaving: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <Dialog open={!!bookmarkModal} onOpenChange={(open) => { if (!open) setBookmarkModal(null); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            Save to Bookmarks
          </DialogTitle>
          <DialogDescription>Bookmark this URL for quick access later.</DialogDescription>
        </DialogHeader>

        {bookmarkModal && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={bookmarkModal.url}
                  readOnly
                  className="h-9 pl-9 text-sm bg-secondary/50 border-border text-muted-foreground"
                />
              </div>
              {bookmarkModal.platform && <PlatformBadge platform={bookmarkModal.platform} />}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Name</label>
              <Input
                placeholder="e.g. VA Facebook Group"
                value={bmName}
                onChange={(e) => setBmName(e.target.value)}
                className="h-9 text-sm bg-secondary/50 border-border"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Notes (optional)</label>
              <Input
                placeholder="e.g. High-quality leads group"
                value={bmNotes}
                onChange={(e) => setBmNotes(e.target.value)}
                className="h-9 text-sm bg-secondary/50 border-border"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setBookmarkModal(null)} className="h-9">Cancel</Button>
          <Button onClick={onSave} disabled={bmSaving} className="gap-2 h-9">
            {bmSaving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              : <><Bookmark className="h-4 w-4" />Save Bookmark</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Already Bookmarked Alert
// ─────────────────────────────────────────────────────────────────────────────

export function AlreadyBookmarkedAlert({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-amber-400 fill-amber-400" />
            Already Bookmarked
          </AlertDialogTitle>
          <AlertDialogDescription>
            This URL is already saved in your bookmarks. You can view and manage it from the Bookmarks page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <AlertDialogAction onClick={() => { onOpenChange(false); window.location.href = "/bookmarks"; }}>
            Go to Bookmarks
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookmark Picker Modal
// ─────────────────────────────────────────────────────────────────────────────

export function BookmarkPickerModal({
  open,
  onClose,
  savedBookmarks,
  selected, setSelected,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  savedBookmarks: BookmarkEntry[];
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onConfirm: () => void;
}) {
  const toggleAll = () => {
    if (selected.size === savedBookmarks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(savedBookmarks.map((b) => b.url)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-primary" />
            Import from Bookmarks
          </DialogTitle>
          <DialogDescription>Select bookmarked URLs to add to the schedule.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-hidden py-1">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <div className={cn(
              "h-4 w-4 rounded border flex items-center justify-center transition-colors",
              selected.size === savedBookmarks.length && savedBookmarks.length > 0
                ? "bg-primary border-primary"
                : "border-border"
            )}>
              {selected.size === savedBookmarks.length && savedBookmarks.length > 0 && (
                <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
              )}
            </div>
            Select all ({savedBookmarks.length})
          </button>

          <Separator className="shrink-0" />

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
            {savedBookmarks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No bookmarks saved yet</p>
            ) : (
              savedBookmarks.map((bm) => {
                const isSelected = selected.has(bm.url);
                const platform = bm.platform || detectPlatform(bm.url);
                return (
                  <button
                    key={bm.id}
                    onClick={() => setSelected((prev) => {
                      const next = new Set(prev);
                      if (isSelected) next.delete(bm.url); else next.add(bm.url);
                      return next;
                    })}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-left transition-colors",
                      isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/40 border border-transparent"
                    )}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      isSelected ? "bg-primary border-primary" : "border-border"
                    )}>
                      {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground truncate">{bm.name}</span>
                        {platform && <PlatformBadge platform={platform} />}
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{bm.url}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button onClick={onConfirm} disabled={selected.size === 0} className="gap-2 h-9">
            <Plus className="h-4 w-4" />
            Add {selected.size > 0 ? `${selected.size} URL${selected.size !== 1 ? "s" : ""}` : "Selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
