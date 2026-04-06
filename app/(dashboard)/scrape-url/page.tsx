"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Calendar, Activity } from "lucide-react";

import type {
  UrlItemResult, HistoryEntry, UrlSchedule, ScheduleRun,
  BookmarkEntry, NewSchedState, EditSchedState,
} from "./_components/shared";
import {
  detectPlatform, buildCustomCron, CRON_PRESETS, DEFAULT_NEW_SCHED,
} from "./_components/shared";

import { ScrapeNowTab } from "./_components/scrape-now-tab";
import { SchedulesTab } from "./_components/schedules-tab";
import { RunHistoryTab } from "./_components/run-history-tab";
import {
  EditScheduleModal, SaveBookmarkModal,
  AlreadyBookmarkedAlert, BookmarkPickerModal,
} from "./_components/modals";

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ScrapeUrlPage() {
  const [activeTab, setActiveTab] = useState<"scrape" | "schedules" | "runs">("scrape");

  // ── Scrape Now ───────────────────────────────────────────
  const [urls, setUrls] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UrlItemResult[]>([]);
  const [totals, setTotals] = useState<{ inserted: number; found: number; dupes: number } | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // ── Schedules ────────────────────────────────────────────
  const [schedules, setSchedules] = useState<UrlSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [newSched, setNewSched] = useState<NewSchedState>(DEFAULT_NEW_SCHED);
  const [schedCreating, setSchedCreating] = useState(false);
  const [schedError, setSchedError] = useState<string | null>(null);

  // ── Edit schedule modal ─────────────────────────────────
  const [editSched, setEditSched] = useState<EditSchedState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Bookmark modal ──────────────────────────────────────
  const [savedBookmarks, setSavedBookmarks] = useState<BookmarkEntry[]>([]);
  const bookmarkedUrls = new Set(savedBookmarks.map((b) => b.url));
  const [bookmarkModal, setBookmarkModal] = useState<{ url: string; platform: string | null } | null>(null);
  const [bmName, setBmName] = useState("");
  const [bmNotes, setBmNotes] = useState("");
  const [bmSaving, setBmSaving] = useState(false);
  const [bmAlreadyExists, setBmAlreadyExists] = useState(false);

  // Bookmark picker state
  const [bmPickerOpen, setBmPickerOpen] = useState<"create" | "edit" | null>(null);
  const [bmPickerSelected, setBmPickerSelected] = useState<Set<string>>(new Set());

  // ── Run history ─────────────────────────────────────────
  const [runHistory, setRunHistory] = useState<ScheduleRun[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [clearingRuns, setClearingRuns] = useState(false);
  const [selectedRunScheduleId, setSelectedRunScheduleId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load bookmarks ──────────────────────────────────────
  const loadBookmarkedUrls = useCallback(() => {
    fetch("/api/bookmarks")
      .then((res) => (res.ok ? res.json() : { bookmarks: [] }))
      .then((data: { bookmarks?: BookmarkEntry[] }) => {
        setSavedBookmarks(data.bookmarks ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadBookmarkedUrls(); }, [loadBookmarkedUrls]);

  const openBmPicker = (target: "create" | "edit") => {
    setBmPickerSelected(new Set());
    setBmPickerOpen(target);
  };

  const confirmBmPicker = () => {
    const pickedUrls = Array.from(bmPickerSelected);
    if (pickedUrls.length === 0) { setBmPickerOpen(null); return; }
    if (bmPickerOpen === "create") {
      setNewSched((s) => {
        const existing = s.urls.filter((u) => u.trim());
        const fresh = pickedUrls.filter((u) => !existing.includes(u));
        return { ...s, urls: [...existing, ...fresh].length > 0 ? [...existing, ...fresh] : [""] };
      });
    } else if (bmPickerOpen === "edit") {
      setEditSched((s) => {
        if (!s) return s;
        const existing = s.urls.filter((u) => u.trim());
        const fresh = pickedUrls.filter((u) => !existing.includes(u));
        return { ...s, urls: [...existing, ...fresh] };
      });
    }
    setBmPickerOpen(null);
  };

  const openBookmarkModal = (url: string) => {
    if (bookmarkedUrls.has(url)) {
      setBmAlreadyExists(true);
      return;
    }
    setBookmarkModal({ url, platform: detectPlatform(url) });
    setBmName(url);
    setBmNotes("");
  };

  const handleSaveBookmark = async () => {
    if (!bookmarkModal) return;
    setBmSaving(true);
    try {
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: bookmarkModal.url,
          name: bmName.trim() || bookmarkModal.url,
          platform: bookmarkModal.platform,
          notes: bmNotes,
        }),
      });
      setSavedBookmarks((prev) => [{ id: "", url: bookmarkModal.url, name: bmName, platform: bookmarkModal.platform }, ...prev]);
      setBookmarkModal(null);
    } catch {} finally { setBmSaving(false); }
  };

  // ── Load history ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/leads/scrape-url")
      .then((r) => r.json())
      .then((data: {
        sessions?: Array<{
          id: string; scraped_url: string; platform: string | null;
          posts_found: number; posts_inserted: number; duplicates: number;
          success: boolean; error_message: string | null; scraped_at: string;
        }>;
      }) => {
        if (data.sessions) {
          setHistory(data.sessions.map((s) => ({
            id: s.id, url: s.scraped_url, platform: s.platform ?? undefined,
            postsFound: s.posts_found, inserted: s.posts_inserted,
            duplicates: s.duplicates, timestamp: new Date(s.scraped_at),
            error: s.error_message ?? undefined,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const clearAllHistory = useCallback(async () => {
    setClearingHistory(true);
    try {
      const res = await fetch("/api/leads/scrape-url", { method: "DELETE" });
      if (res.ok) setHistory([]);
    } catch {}
    finally { setClearingHistory(false); }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    try {
      const res = await fetch(`/api/leads/scrape-url?id=${sessionId}`, { method: "DELETE" });
      if (res.ok) setHistory((prev) => prev.filter((e) => e.id !== sessionId));
    } catch {}
    finally { setDeletingSessionId(null); }
  }, []);

  // ── Run history ──────────────────────────────────────
  const loadRunHistory = useCallback(async (scheduleId?: string) => {
    setRunHistoryLoading(true);
    try {
      const url = scheduleId
        ? `/api/schedules/runs?scheduleId=${scheduleId}`
        : "/api/schedules/runs";
      const res = await fetch(url);
      const data = await res.json();
      setRunHistory(data.runs ?? []);
    } catch {
      setRunHistory([]);
    } finally {
      setRunHistoryLoading(false);
    }
  }, []);

  const clearAllRuns = useCallback(async () => {
    setClearingRuns(true);
    try {
      const res = await fetch("/api/schedules/runs", { method: "DELETE" });
      if (res.ok) setRunHistory([]);
    } catch {}
    finally { setClearingRuns(false); }
  }, []);

  // ── Load schedules + auto-poll ────────────────────────
  const loadSchedules = useCallback((silent = false) => {
    if (!silent) setSchedulesLoading(true);
    return fetch("/api/schedules")
      .then((r) => r.json())
      .then((data: { schedules?: UrlSchedule[] }) => setSchedules(data.schedules ?? []))
      .catch(() => {})
      .finally(() => { if (!silent) setSchedulesLoading(false); });
  }, []);

  useEffect(() => {
    if (activeTab !== "schedules") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    loadSchedules();
    pollRef.current = setInterval(() => loadSchedules(true), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTab, loadSchedules]);

  useEffect(() => {
    if (activeTab !== "runs") {
      if (runsPollRef.current) clearInterval(runsPollRef.current);
      return;
    }
    loadSchedules(true);
    loadRunHistory(selectedRunScheduleId ?? undefined);
    // Poll every 5s so running indicators update in near-real-time
    runsPollRef.current = setInterval(() => {
      loadRunHistory(selectedRunScheduleId ?? undefined);
      loadSchedules(true);
    }, 5_000);
    return () => { if (runsPollRef.current) clearInterval(runsPollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedRunScheduleId]);

  // ── Schedule actions ─────────────────────────────────────
  const handleCreateSchedule = async () => {
    const effectiveCron = newSched.cron === "custom"
      ? (newSched.customMode === "raw"
          ? newSched.customCron.trim()
          : buildCustomCron(newSched.customMode, {
              minutes: newSched.customMinutes,
              hours: newSched.customHours,
              time: newSched.customTime,
              days: newSched.customDays,
            }))
      : newSched.cron;
    setSchedError(null);
    if (!newSched.name.trim()) { setSchedError("Schedule name is required"); return; }
    const validUrls = newSched.urls.map((u) => u.trim()).filter(Boolean);
    if (validUrls.length === 0) { setSchedError("At least one target URL is required"); return; }
    for (const u of validUrls) {
      try { new URL(u); } catch { setSchedError(`Invalid URL: ${u}`); return; }
    }
    if (!effectiveCron) { setSchedError("Please enter a cron expression"); return; }

    setSchedCreating(true);
    try {
      const errors: string[] = [];
      for (let i = 0; i < validUrls.length; i++) {
        const name = validUrls.length > 1
          ? `${newSched.name.trim()} (#${i + 1})`
          : newSched.name.trim();
        const res = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, url: validUrls[i],
            cron: effectiveCron, status: newSched.status,
          }),
        });
        const data = await res.json();
        if (!res.ok) errors.push(data.error || `Failed to create schedule for ${validUrls[i]}`);
      }
      if (errors.length > 0) {
        setSchedError(errors.join("; "));
      } else {
        // If auto-scrape is on, trigger an immediate group run after creation
        if (newSched.status === "active") {
          // Reload schedules to get the newly created IDs
          const schedRes = await fetch("/api/schedules").then((r) => r.json()).catch(() => null);
          if (schedRes?.schedules?.length) {
            // Find the first schedule matching the name we just created
            const baseName = newSched.name.trim();
            const created = schedRes.schedules.find((s: { name: string }) =>
              s.name === baseName || s.name === `${baseName} (#1)`
            );
            if (created) {
              // run-group triggers all URLs in the group sequentially
              setRunningId(created.id);
              fetch(`/api/schedules/${created.id}/run-group`, { method: "POST" })
                .catch(() => {})
                .finally(() => { setRunningId(null); loadSchedules(true); });
            }
          }
        }
        setNewSched(DEFAULT_NEW_SCHED);
      }
      loadSchedules();
    } catch {
      setSchedError("Could not reach scraper service");
    } finally {
      setSchedCreating(false);
    }
  };

  const handlePause   = async (id: string) => { await fetch(`/api/schedules/${id}/pause`,  { method: "POST" }); loadSchedules(true); };
  const handleResume  = async (id: string) => { await fetch(`/api/schedules/${id}/resume`, { method: "POST" }); loadSchedules(true); };
  const handleRunNow  = async (id: string) => {
    setRunningId(id);
    await fetch(`/api/schedules/${id}/run`, { method: "POST" }).catch(() => {});
    setRunningId(null);
    loadSchedules(true);
  };
  const handleRunGroup = async (id: string) => {
    setRunningId(id);
    await fetch(`/api/schedules/${id}/run-group`, { method: "POST" }).catch(() => {});
    setRunningId(null);
    loadSchedules(true);
  };
  const handleDelete  = async (id: string) => { await fetch(`/api/schedules/${id}`, { method: "DELETE" }); loadSchedules(true); };

  const openEditGroupModal = (items: UrlSchedule[]) => {
    const first = items[0];
    const baseName = first.name.replace(/\s*\(#\d+\)$/, "").trim();
    const isPreset = CRON_PRESETS.some((p) => p.value === first.cron);

    let customMode: "minutes" | "hours" | "daily" | "weekly" | "raw" = "raw";
    let customMinutes = "10", customHours = "3", customTime = "09:00", customDays = [1];
    if (!isPreset) {
      const parts = first.cron.trim().split(/\s+/);
      if (parts.length === 5) {
        const [min, hour, dom, , dow] = parts;
        const minStep = min.match(/^\*\/(\d+)$/);
        const hourStep = hour.match(/^\*\/(\d+)$/);
        if (minStep && hour === "*" && dom === "*") {
          customMode = "minutes"; customMinutes = minStep[1];
        } else if ((min === "0" || min === "00") && hourStep && dom === "*") {
          customMode = "hours"; customHours = hourStep[1];
        } else if ((min === "0" || min === "00") && hour === "*" && dom === "*") {
          customMode = "hours"; customHours = "1";
        } else if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && dow === "*") {
          customMode = "daily"; customTime = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
        } else if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && /^[\d,]+$/.test(dow)) {
          customMode = "weekly"; customTime = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
          customDays = dow.split(",").map(Number);
        }
      }
    }

    setEditSched({
      id: first.id,
      name: baseName,
      urls: items.map((s) => s.url),
      cron: isPreset ? first.cron : "custom",
      customCron: isPreset ? "" : first.cron,
      customMode, customMinutes, customHours, customTime, customDays,
      status: first.status,
      _groupIds: items.map((s) => s.id),
    });
    setEditError(null);
  };

  const handleUpdateSchedule = async () => {
    if (!editSched) return;
    if (!editSched.name.trim()) { setEditError("Schedule name is required"); return; }
    const validUrls = editSched.urls.filter((u) => u.trim());
    if (validUrls.length === 0) { setEditError("At least one URL is required"); return; }
    for (const u of validUrls) {
      try { new URL(u); } catch { setEditError(`Invalid URL: ${u}`); return; }
    }
    const cron = editSched.cron === "custom"
      ? (editSched.customMode === "raw"
          ? editSched.customCron.trim()
          : buildCustomCron(editSched.customMode, {
              minutes: editSched.customMinutes,
              hours: editSched.customHours,
              time: editSched.customTime,
              days: editSched.customDays,
            }))
      : editSched.cron;
    if (!cron) { setEditError("A cron expression is required"); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const errors: string[] = [];
      const existingIds = editSched._groupIds;

      for (let i = 0; i < Math.min(validUrls.length, existingIds.length); i++) {
        const name = validUrls.length > 1 && i > 0
          ? `${editSched.name.trim()} (#${i + 1})`
          : editSched.name.trim();
        const res = await fetch(`/api/schedules/${existingIds[i]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, url: validUrls[i], cron, status: editSched.status }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          errors.push(data.error || `Failed to update (${res.status})`);
        }
      }

      for (let i = validUrls.length; i < existingIds.length; i++) {
        await fetch(`/api/schedules/${existingIds[i]}`, { method: "DELETE" }).catch(() => {});
      }

      for (let i = existingIds.length; i < validUrls.length; i++) {
        const name = `${editSched.name.trim()} (#${i + 1})`;
        const createRes = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, url: validUrls[i], cron, status: editSched.status }),
        });
        if (!createRes.ok) {
          const data = await createRes.json().catch(() => ({}));
          errors.push(data.error || `Failed to create schedule for ${validUrls[i]}`);
        }
      }

      if (errors.length > 0) throw new Error(errors.join("; "));
      setEditSched(null);
      loadSchedules(true);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6">
      <Header
        title="Scrape URL"
        subtitle="Extract leads from any URL — social platforms, forums, blogs, job boards & more"
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["scrape", "schedules", "runs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "scrape" && <Search className="h-3.5 w-3.5" />}
            {tab === "schedules" && <Calendar className="h-3.5 w-3.5" />}
            {tab === "runs" && <Activity className="h-3.5 w-3.5" />}
            {tab === "scrape" ? "Scrape Now" : tab === "schedules" ? "Schedules" : "Run"}
            {tab === "schedules" && schedules.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                {schedules.length}
              </Badge>
            )}
            {tab === "runs" && runHistory.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                {runHistory.length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: SCRAPE NOW ═══ */}
      {activeTab === "scrape" && (
        <ScrapeNowTab
          urls={urls} setUrls={setUrls}
          loading={loading} setLoading={setLoading}
          results={results} setResults={setResults}
          totals={totals} setTotals={setTotals}
          scrapeError={scrapeError} setScrapeError={setScrapeError}
          history={history} setHistory={setHistory}
          historyLoading={historyLoading}
          deletingSessionId={deletingSessionId}
          savedBookmarks={savedBookmarks}
          bookmarkedUrls={bookmarkedUrls}
          openBookmarkModal={openBookmarkModal}
          clearAllHistory={clearAllHistory}
          clearingHistory={clearingHistory}
          deleteSession={deleteSession}
        />
      )}

      {/* ═══ TAB: SCHEDULES ═══ */}
      {activeTab === "schedules" && (
        <SchedulesTab
          schedules={schedules}
          schedulesLoading={schedulesLoading}
          runningId={runningId}
          newSched={newSched} setNewSched={setNewSched}
          schedCreating={schedCreating}
          schedError={schedError} setSchedError={setSchedError}
          savedBookmarks={savedBookmarks}
          onCreateSchedule={handleCreateSchedule}
          onPause={handlePause}
          onResume={handleResume}
          onRunNow={handleRunNow}
          onRunGroup={handleRunGroup}
          onDelete={handleDelete}
          onEditGroup={openEditGroupModal}
          onRefresh={loadSchedules}
          onOpenBmPicker={openBmPicker}
        />
      )}

      {/* ═══ TAB: RUN HISTORY ═══ */}
      {activeTab === "runs" && (
        <RunHistoryTab
          schedules={schedules}
          schedulesLoading={schedulesLoading}
          runningId={runningId}
          runHistory={runHistory}
          runHistoryLoading={runHistoryLoading}
          clearingRuns={clearingRuns}
          selectedRunScheduleId={selectedRunScheduleId}
          onSelectSchedule={setSelectedRunScheduleId}
          onLoadRunHistory={loadRunHistory}
          onClearAllRuns={clearAllRuns}
          onRunNow={handleRunNow}
          onPause={handlePause}
          onResume={handleResume}
          onDelete={handleDelete}
          onRefreshSchedules={loadSchedules}
        />
      )}

      {/* ═══ MODALS ═══ */}
      <EditScheduleModal
        editSched={editSched} setEditSched={setEditSched}
        editSaving={editSaving} editError={editError}
        savedBookmarks={savedBookmarks}
        onSave={handleUpdateSchedule}
        onOpenBmPicker={openBmPicker}
      />

      <SaveBookmarkModal
        bookmarkModal={bookmarkModal} setBookmarkModal={setBookmarkModal}
        bmName={bmName} setBmName={setBmName}
        bmNotes={bmNotes} setBmNotes={setBmNotes}
        bmSaving={bmSaving}
        onSave={handleSaveBookmark}
      />

      <AlreadyBookmarkedAlert
        open={bmAlreadyExists}
        onOpenChange={setBmAlreadyExists}
      />

      <BookmarkPickerModal
        open={!!bmPickerOpen}
        onClose={() => setBmPickerOpen(null)}
        savedBookmarks={savedBookmarks}
        selected={bmPickerSelected}
        setSelected={setBmPickerSelected}
        onConfirm={confirmBmPicker}
      />
    </div>
  );
}
