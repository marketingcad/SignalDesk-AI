"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getPlatformColor } from "@/lib/utils";
import type { Platform } from "@/lib/types";
import {
  Save,
  Radio,
  Zap,
  Hash,
  Shield,
  Globe,
  Plus,
  X,
  AlertTriangle,
  Loader2,
  Sparkles,
  Check,
  Lightbulb,
  Search,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CircleDot,
  CalendarRange,
  Trash2,
  ExternalLink,
} from "lucide-react";

type KeywordCategory = "high_intent" | "medium_intent" | "negative";
type KeywordsState = Record<KeywordCategory, string[]>;

const ALL_PLATFORMS: Platform[] = ["Facebook", "LinkedIn", "Reddit", "X", "Other"];

// In-page navigation — one entry per settings container box. Clicking an entry
// smooth-scrolls to the matching section (anchored by `id`), and the active
// entry is highlighted via scrollspy, mirroring the app sidebar's behavior.
const SECTIONS: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "platform-monitoring", label: "Platform Monitoring", icon: Radio },
  { id: "browser-login", label: "Browser Login", icon: KeyRound },
  { id: "alert-threshold", label: "Alert Threshold", icon: Zap },
  { id: "date-range", label: "Date Range", icon: CalendarRange },
  { id: "keywords", label: "Keywords", icon: Hash },
  { id: "keyword-discovery", label: "Keyword Discovery", icon: Sparkles },
  { id: "scoring-rules", label: "Scoring Rules", icon: Shield },
];

export default function SettingsPage() {
  // --- Platform state ---
  const [platformToggles, setPlatformToggles] = useState<Record<Platform, boolean>>({
    Facebook: true, LinkedIn: true, Reddit: true, X: false, Other: true,
  });
  const [platformCounts, setPlatformCounts] = useState<Record<Platform, number>>({
    Facebook: 0, LinkedIn: 0, Reddit: 0, X: 0, Other: 0,
  });

  // --- Keywords state ---
  const [keywords, setKeywords] = useState<KeywordsState>({
    high_intent: [], medium_intent: [], negative: [],
  });

  // --- Threshold state ---
  const [threshold, setThreshold] = useState(80);

  // --- Date Range filter state ---
  const [dateRange, setDateRange] = useState<{
    enabled: boolean;
    mode: "today" | "range";
    startDate: string;
    endDate: string;
  }>({
    enabled: false,
    mode: "today",
    startDate: "",
    endDate: "",
  });

  // Scrapers only surface posts from the last 7 days, so a custom range older
  // than that can never return results. Floor the date pickers accordingly.
  const minRangeDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  // --- UI state ---
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Browser Login state ---
  const [authStatus, setAuthStatus] = useState<{
    cookiesSaved: boolean;
    authenticated?: { facebook: boolean; linkedin: boolean; x: boolean };
    health: {
      overall: "healthy" | "warning" | "expired";
      platforms: Array<{
        platform: string;
        consecutiveZeroRuns: number;
        lastRunAt: string | null;
        lastPostCount: number;
        status: "healthy" | "warning" | "expired";
        lastValidatedAt: string | null;
        lastValidationResult: string | null;
      }>;
    } | null;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);

  // --- Live Login (cloud remote browser) state ---
  const [liveSession, setLiveSession] = useState<{
    platform: string;
    expiresAt: number;
    viewerUrl: string;
  } | null>(null);
  const [liveStarting, setLiveStarting] = useState<string | null>(null);
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // --- Keyword Discovery state ---
  const [discovering, setDiscovering] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ keyword: string; category: string; reason: string }>>([]);
  const [discoveryMeta, setDiscoveryMeta] = useState<{ leadsAnalyzed: number; message?: string } | null>(null);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<string>>(new Set());

  // --- Browser Login actions ---
  const loadAuthStatus = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/browser-login");
      if (res.ok) {
        const data = await res.json();
        setAuthStatus(data);
      }
    } catch {
      // scraper service unreachable
    } finally {
      setAuthLoading(false);
    }
  };

  const validatePlatform = async (platform: string) => {
    setValidating(platform);
    try {
      await fetch("/api/auth/browser-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", platform: platform.toLowerCase() }),
      });
      await loadAuthStatus();
    } catch {
      // scraper unreachable
    } finally {
      setValidating(null);
    }
  };

  const resetPlatformHealth = async (platform: string) => {
    try {
      await fetch("/api/auth/browser-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", platform: platform.toLowerCase() }),
      });
      await loadAuthStatus();
    } catch {
      // scraper unreachable
    }
  };

  // --- Live Login actions (cloud remote browser) ---
  const startLiveLogin = async (platform: string) => {
    setLiveStarting(platform);
    setLiveError(null);
    try {
      const res = await fetch("/api/auth/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", platform: platform.toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data.error || "Could not start the login browser.");
        return;
      }
      // The viewer is embedded in an in-app modal (see LiveLoginModal). We no
      // longer pop a new tab: a post-`await` window.open is blocked by Safari on
      // macOS (the user gesture is already spent), which was the root cause of
      // "Live Login doesn't work on Mac". The modal's iframe avoids popups
      // entirely; an explicit "Open in new tab" button (a fresh click) remains
      // as a fallback for anyone who prefers a full tab.
      setLiveSession({ platform, expiresAt: data.expiresAt, viewerUrl: data.viewerUrl });
    } catch {
      setLiveError("Scraper service unreachable.");
    } finally {
      setLiveStarting(null);
    }
  };

  const saveLiveLogin = async () => {
    setLiveSaving(true);
    setLiveError(null);
    try {
      const res = await fetch("/api/auth/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data.error || "Could not save the session.");
        return;
      }
      setLiveSession(null);
      await loadAuthStatus();
    } catch {
      setLiveError("Scraper service unreachable.");
    } finally {
      setLiveSaving(false);
    }
  };

  const cancelLiveLogin = async () => {
    setLiveError(null);
    try {
      await fetch("/api/auth/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    } catch {
      // best effort
    } finally {
      setLiveSession(null);
    }
  };

  // --- Load all settings on mount ---
  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, countsRes, keywordsRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/dashboard/platform-counts"),
          fetch("/api/keywords"),
        ]);

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.platform_toggles) {
            setPlatformToggles((prev) => ({ ...prev, ...settings.platform_toggles }));
          }
          if (settings.alert_threshold) {
            setThreshold(settings.alert_threshold.value);
          }
          if (settings.date_range_filter) {
            setDateRange({
              enabled: !!settings.date_range_filter.enabled,
              mode: settings.date_range_filter.mode === "range" ? "range" : "today",
              startDate: settings.date_range_filter.startDate || "",
              endDate: settings.date_range_filter.endDate || "",
            });
          }
        }

        if (countsRes.ok) {
          const counts = await countsRes.json();
          const mapped: Record<Platform, number> = { Facebook: 0, LinkedIn: 0, Reddit: 0, X: 0, Other: 0 };
          for (const p of ALL_PLATFORMS) {
            mapped[p] = counts[p]?.total ?? 0;
          }
          setPlatformCounts(mapped);
        }

        if (keywordsRes.ok) {
          const kw = await keywordsRes.json();
          if (kw) setKeywords(kw);
        }
      } catch {
        // silently use defaults
      } finally {
        setLoading(false);
      }
    };
    load();
    loadAuthStatus();
  }, []);

  // Deep-link support: when arriving at /settings#browser-login (e.g. from the
  // session-expiry modal), scroll that section into view once it has rendered.
  useEffect(() => {
    if (loading) return;
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [loading]);

  // --- Keywords CRUD (already wired to API) ---
  const addKeyword = async (keyword: string, category: KeywordCategory) => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed || keywords[category].includes(trimmed)) return;
    setKeywords((prev) => ({
      ...prev,
      [category]: [...prev[category], trimmed],
    }));
    try {
      await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed, category }),
      });
    } catch {
      // optimistic update already applied
    }
  };

  const removeKeyword = async (keyword: string, category: KeywordCategory) => {
    setKeywords((prev) => ({
      ...prev,
      [category]: prev[category].filter((kw) => kw !== keyword),
    }));
    try {
      await fetch("/api/keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, category }),
      });
    } catch {
      // optimistic update already applied
    }
  };

  // --- Keyword Discovery ---
  const discoverKeywords = async () => {
    setDiscovering(true);
    setSuggestions([]);
    setDiscoveryMeta(null);
    setAddedSuggestions(new Set());
    try {
      const res = await fetch("/api/keywords/discover", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDiscoveryMeta({ leadsAnalyzed: 0, message: err.error || "Discovery failed" });
        return;
      }
      const data = await res.json();
      // Filter against local keyword state (more current than DB snapshot used by API)
      const allLocal = [...keywords.high_intent, ...keywords.medium_intent, ...keywords.negative];
      const localSet = new Set(allLocal.map((k) => k.toLowerCase()));
      const filtered = (data.suggestions || []).filter(
        (s: { keyword: string }) => !localSet.has(s.keyword.toLowerCase())
      );
      setSuggestions(filtered);
      setDiscoveryMeta({
        leadsAnalyzed: data.leadsAnalyzed || 0,
        message: filtered.length === 0
          ? data.message || "No new keywords discovered. Your keyword list already covers your leads well."
          : undefined,
      });
    } catch {
      setDiscoveryMeta({ leadsAnalyzed: 0, message: "Failed to connect to AI service" });
    } finally {
      setDiscovering(false);
    }
  };

  const acceptSuggestion = async (keyword: string, category: string) => {
    // Mark added immediately to prevent double-click race condition
    setAddedSuggestions((prev) => new Set(prev).add(keyword));
    await addKeyword(keyword, category as KeywordCategory);
  };

  // --- Toggle platform locally ---
  const togglePlatform = (platform: Platform) => {
    setPlatformToggles((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  // --- Save a section to the API ---
  const handleSectionSave = async (section: string) => {
    setSavingSection(section);

    let key: string;
    let value: unknown;

    switch (section) {
      case "platform":
        key = "platform_toggles";
        value = platformToggles;
        break;
      case "threshold":
        key = "alert_threshold";
        value = { value: threshold };
        break;
      case "date_range":
        key = "date_range_filter";
        value = dateRange;
        break;
      default:
        setSavingSection(null);
        return;
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (res.ok) {
        setSavedSection(section);
        setTimeout(() => setSavedSection(null), 2000);
      }
    } catch {
      // save failed silently
    } finally {
      setSavingSection(null);
    }
  };

  // --- Clear/delete the saved date range config (reset to default off) ---
  const clearDateRange = async () => {
    const cleared = { enabled: false, mode: "today" as const, startDate: "", endDate: "" };
    setDateRange(cleared);
    setSavingSection("date_range");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "date_range_filter", value: cleared }),
      });
      if (res.ok) {
        setSavedSection("date_range");
        setTimeout(() => setSavedSection(null), 2000);
      }
    } catch {
      // clear failed silently
    } finally {
      setSavingSection(null);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="Settings" subtitle="Configure monitoring and alert preferences" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Settings"
        subtitle="Configure monitoring and alert preferences"
      />
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
       <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <SettingsNav sections={SECTIONS} />
        <div className="min-w-0 flex-1 space-y-4 md:space-y-6">
        {/* Platform Monitoring */}
        <SettingsSection
          id="platform-monitoring"
          icon={Radio}
          title="Platform Monitoring"
          description="Toggle detection for each supported platform"
          onSave={() => handleSectionSave("platform")}
          saved={savedSection === "platform"}
          saving={savingSection === "platform"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ALL_PLATFORMS.map((platform) => {
              const enabled = platformToggles[platform];
              const count = platformCounts[platform];
              const color = getPlatformColor(platform);
              return (
                <div
                  key={platform}
                  className={cn(
                    "relative flex items-center justify-between rounded-xl border p-4 transition-all cursor-pointer",
                    enabled
                      ? "border-border bg-accent/30"
                      : "border-border bg-card opacity-60"
                  )}
                  onClick={() => togglePlatform(platform)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ background: `${color}15` }}
                    >
                      <Globe className="h-5 w-5" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {platform}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {count} leads detected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {enabled && (
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                        <span className="text-xs text-emerald-400 font-medium">
                          Active
                        </span>
                      </div>
                    )}
                    <ToggleSwitch
                      enabled={enabled}
                      onChange={() => togglePlatform(platform)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsSection>

        {/* Browser Login */}
        <SettingsSection
          id="browser-login"
          icon={KeyRound}
          title="Browser Login"
          description="Manage authenticated sessions for Facebook and LinkedIn scraping"
        >
          <div className="space-y-4">
            {/* Status overview */}
            {authLoading && !authStatus ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking session status...
              </div>
            ) : authStatus === null ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-amber-400">
                  Scraper service is not reachable. Start it to manage browser sessions.
                </p>
              </div>
            ) : (
              <>
                {/* Per-platform authentication — green = logged in, red = needs login */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Platform Sessions
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { key: "facebook", label: "Facebook", validatable: true },
                      { key: "linkedin", label: "LinkedIn", validatable: true },
                      { key: "x", label: "X", validatable: false },
                    ] as const).map(({ key, label, validatable }) => {
                      const authed = authStatus.authenticated?.[key] ?? false;
                      const health = authStatus.health?.platforms?.find((p) => p.platform === label);
                      // Only treat the session as expired when a real cookie
                      // validation said so — NOT from the empty-runs heuristic,
                      // which can flag an authenticated session that simply found
                      // no new posts (the false "Session expired" bug).
                      const expired =
                        authed &&
                        (health?.lastValidationResult === "expired" ||
                          health?.lastValidationResult === "no_cookies");
                      const active = authed && !expired;

                      const statusText = !authed
                        ? "Not authenticated"
                        : expired
                        ? "Session expired — re-login"
                        : "Session active";

                      const showValidate = validatable && active;
                      const showLogin = !authed || expired;
                      const showReset = authed && expired;

                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex flex-col gap-3 rounded-lg border px-4 py-3 transition-colors",
                            active && "border-emerald-500/30 bg-emerald-500/5",
                            (expired || !authed) && "border-rose-500/30 bg-rose-500/5",
                            !authed && "opacity-70"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={cn(
                                  "h-2.5 w-2.5 rounded-full",
                                  active && "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]",
                                  (expired || !authed) && "bg-rose-400"
                                )}
                              />
                              <span className="text-sm font-medium text-foreground">{label}</span>
                            </div>
                            {active ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-400" />
                            )}
                          </div>

                          <p
                            className={cn(
                              "text-xs font-medium",
                              active && "text-emerald-400",
                              (expired || !authed) && "text-rose-400"
                            )}
                          >
                            {statusText}
                          </p>

                          {(showValidate || showLogin || showReset) && (
                            <div className="flex items-center gap-1.5">
                              {showLogin && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 flex-1 gap-1.5 text-xs"
                                  onClick={() => startLiveLogin(label)}
                                  disabled={liveStarting !== null}
                                >
                                  {liveStarting === label ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Globe className="h-3.5 w-3.5" />
                                  )}
                                  {expired ? "Re-login" : "Log in"}
                                </Button>
                              )}
                              {showValidate && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 flex-1 gap-1.5 text-xs"
                                  onClick={() => validatePlatform(label)}
                                  disabled={validating === label}
                                  title="Re-check this session"
                                >
                                  {validating === label ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                  Validate
                                </Button>
                              )}
                              {showReset && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => resetPlatformHealth(label)}
                                  title="Reset health tracking"
                                >
                                  Reset
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Live Login (cloud) — remote viewable browser */}
            <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <Globe className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Live Login (Cloud)</p>
                  <p className="text-xs text-muted-foreground">
                    Opens the scraper&apos;s browser in a new tab so you can log in here —
                    no local setup. Solve any 2FA/CAPTCHA, then click Save Session.
                  </p>
                </div>
              </div>

              {liveError && (
                <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                  <p className="text-xs text-rose-400">{liveError}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {["Facebook", "LinkedIn", "X"].map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => startLiveLogin(p)}
                    disabled={liveStarting !== null || liveSession !== null}
                  >
                    {liveStarting === p ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    Log in to {p}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Intent Threshold */}
        <SettingsSection
          id="alert-threshold"
          icon={Zap}
          title="Alert Threshold"
          description="Set the minimum intent score to trigger real-time alerts"
          onSave={() => handleSectionSave("threshold")}
          saved={savedSection === "threshold"}
          saving={savingSection === "threshold"}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={30}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                aria-label="Alert threshold (minimum intent score)"
                aria-valuetext={`${threshold} intent score`}
                className="flex-1 h-2 rounded-full appearance-none bg-muted accent-primary cursor-pointer"
              />
              <div className="flex h-10 w-16 items-center justify-center rounded-lg border border-border bg-secondary font-mono text-sm font-bold text-foreground">
                {threshold}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Low (30)</span>
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                Current: Score {">"}= {threshold} triggers alerts
              </span>
              <span>Max (100)</span>
            </div>
          </div>
        </SettingsSection>

        {/* Date Range */}
        <SettingsSection
          id="date-range"
          icon={CalendarRange}
          title="Date Range"
          description="Only capture leads whose post date falls within this range — others are skipped and never sent to Discord"
          onSave={() => handleSectionSave("date_range")}
          saved={savedSection === "date_range"}
          saving={savingSection === "date_range"}
        >
          <div className="space-y-4">
            {/* Active/inactive status + clear */}
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  dateRange.enabled
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-secondary text-muted-foreground"
                )}
              >
                {dateRange.enabled ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {dateRange.enabled
                  ? `Active — ${dateRange.mode === "today" ? "Today only" : "Custom range"}`
                  : "Inactive — default 7-day window"}
              </span>
              {(dateRange.enabled || dateRange.startDate || dateRange.endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  onClick={clearDateRange}
                  disabled={savingSection === "date_range"}
                  title="Clear date range and revert to the default window"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-accent/30 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Limit leads to a date range</p>
                <p className="text-xs text-muted-foreground">
                  When off, the default rolling 7-day window is used
                </p>
              </div>
              <ToggleSwitch
                enabled={dateRange.enabled}
                onChange={() => setDateRange((prev) => ({ ...prev, enabled: !prev.enabled }))}
              />
            </div>

            {/* Mode selector + dates */}
            <div
              className={cn(
                "space-y-4 transition-opacity",
                dateRange.enabled ? "opacity-100" : "opacity-50 pointer-events-none"
              )}
            >
              {/* Segmented mode control */}
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/50 p-1">
                <button
                  type="button"
                  onClick={() => setDateRange((prev) => ({ ...prev, mode: "today" }))}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    dateRange.mode === "today"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  Today only
                </button>
                <button
                  type="button"
                  onClick={() => setDateRange((prev) => ({ ...prev, mode: "range" }))}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    dateRange.mode === "range"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  Custom range
                </button>
              </div>

              {/* Custom date inputs (only for range mode) */}
              {dateRange.mode === "range" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <div className="space-y-1.5">
                    <label htmlFor="date-range-start" className="text-xs font-medium text-muted-foreground">Start date</label>
                    <Input
                      id="date-range-start"
                      type="date"
                      value={dateRange.startDate}
                      min={minRangeDate}
                      max={dateRange.endDate || undefined}
                      onChange={(e) => setDateRange((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="h-9 text-sm bg-secondary/50 border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="date-range-end" className="text-xs font-medium text-muted-foreground">End date</label>
                    <Input
                      id="date-range-end"
                      type="date"
                      value={dateRange.endDate}
                      min={dateRange.startDate || minRangeDate}
                      onChange={(e) => setDateRange((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="h-9 text-sm bg-secondary/50 border-border"
                    />
                  </div>
                  <p className="sm:col-span-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-400" />
                    Scrapers only see posts from the last 7 days, so dates older than that won&apos;t return results.
                  </p>
                </div>
              )}
            </div>

            {dateRange.enabled && (
              <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-xs text-muted-foreground">
                {dateRange.mode === "today" ? (
                  <span className="flex items-center gap-1.5">
                    <CircleDot className="h-3.5 w-3.5 text-emerald-400" />
                    Capturing only leads posted <span className="font-medium text-foreground">today</span>. This updates automatically each day — no need to change the dates.
                  </span>
                ) : dateRange.startDate || dateRange.endDate ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarRange className="h-3.5 w-3.5 text-primary" />
                    Capturing leads
                    {dateRange.startDate ? ` from ${dateRange.startDate}` : " up to"}
                    {dateRange.endDate ? ` to ${dateRange.endDate}` : dateRange.startDate ? " onward" : ""}.
                    Posts outside this range are skipped.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    Set a start and/or end date. Leaving both blank falls back to the default 7-day window.
                  </span>
                )}
              </div>
            )}
          </div>
        </SettingsSection>

        {/* Keywords */}
        <SettingsSection
          id="keywords"
          icon={Hash}
          title="Keywords"
          description="Manage detection keywords for each intent category"
        >
          <div className="space-y-5">
            <KeywordSection
              title="Primary Keywords"
              subtitle="High-intent signals (+40 score)"
              keywords={keywords.high_intent}
              color="emerald"
              onAdd={(kw) => addKeyword(kw, "high_intent")}
              onRemove={(kw) => removeKeyword(kw, "high_intent")}
            />
            <KeywordSection
              title="Secondary Keywords"
              subtitle="Medium-intent signals (+20 score)"
              keywords={keywords.medium_intent}
              color="amber"
              onAdd={(kw) => addKeyword(kw, "medium_intent")}
              onRemove={(kw) => removeKeyword(kw, "medium_intent")}
            />
            <KeywordSection
              title="Negative Keywords"
              subtitle="Noise filter (-40 score)"
              keywords={keywords.negative}
              color="rose"
              onAdd={(kw) => addKeyword(kw, "negative")}
              onRemove={(kw) => removeKeyword(kw, "negative")}
            />
          </div>
        </SettingsSection>

        {/* Keyword Discovery */}
        <SettingsSection
          id="keyword-discovery"
          icon={Sparkles}
          title="Keyword Discovery"
          description="AI analyzes your high-intent leads to suggest new keywords you're missing"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                className="gap-1.5 shadow-sm shadow-primary/25"
                onClick={discoverKeywords}
                disabled={discovering}
              >
                {discovering ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lightbulb className="h-3.5 w-3.5" />
                )}
                {discovering ? "Analyzing leads..." : "Discover New Keywords"}
              </Button>
              {discoveryMeta && discoveryMeta.leadsAnalyzed > 0 && !discoveryMeta.message && (
                <span className="text-xs text-muted-foreground">
                  Analyzed {discoveryMeta.leadsAnalyzed} high-intent leads
                </span>
              )}
            </div>

            {discoveryMeta?.message && (
              <div className="rounded-lg border border-border bg-secondary px-4 py-3">
                <p className="text-xs text-muted-foreground">{discoveryMeta.message}</p>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {suggestions.length} Suggestions
                </p>
                <div className="space-y-1.5">
                  {suggestions.map((s) => {
                    const added = addedSuggestions.has(s.keyword);
                    return (
                      <div
                        key={s.keyword}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all",
                          added
                            ? "border-emerald-500/20 bg-emerald-500/5 opacity-60"
                            : "border-border bg-secondary hover:bg-accent/30"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{s.keyword}</span>
                            <span className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                              s.category === "high_intent"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                            )}>
                              {s.category === "high_intent" ? "High" : "Medium"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{s.reason}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-7 gap-1 shrink-0",
                            added && "border-emerald-500/30 text-emerald-400"
                          )}
                          onClick={() => acceptSuggestion(s.keyword, s.category)}
                          disabled={added}
                        >
                          {added ? (
                            <>
                              <Check className="h-3 w-3" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SettingsSection>

        {/* Scoring Rules */}
        <SettingsSection
          id="scoring-rules"
          icon={Shield}
          title="Scoring Rules"
          description="Intent scoring weights for lead classification"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ScoreRule label="Direct hiring phrase" value="+40" color="emerald" />
            <ScoreRule label="Urgency phrase" value="+20" color="emerald" />
            <ScoreRule
              label="Tool-specific requirement"
              value="+15"
              color="emerald"
            />
            <ScoreRule label="Target country match" value="+10" color="emerald" />
            <ScoreRule label="Engagement threshold" value="+5" color="emerald" />
            <ScoreRule label="Looking for VA job" value="-40" color="rose" />
            <ScoreRule label="Self-promotion post" value="-30" color="rose" />
          </div>
          <div className="mt-4 flex gap-6 rounded-lg border border-border bg-secondary px-4 py-3 text-xs">
            <span>
              <span className="font-semibold text-emerald-400">80+</span>{" "}
              <span className="text-muted-foreground">= High Intent</span>
            </span>
            <span>
              <span className="font-semibold text-amber-400">50–79</span>{" "}
              <span className="text-muted-foreground">= Medium</span>
            </span>
            <span>
              <span className="font-semibold text-zinc-400">{"<"}50</span>{" "}
              <span className="text-muted-foreground">= Low</span>
            </span>
          </div>
        </SettingsSection>
        </div>
       </div>
      </div>

      {/* Live Login viewer — embedded in-app so there's no popup to be blocked
          (Safari on macOS blocks the post-fetch window.open). Log in inside the
          iframe and save the session without leaving the dashboard.

          Portaled to <body>: the dashboard's .animate-page-enter wrapper keeps a
          `transform: translateY(0)` (animation-fill-mode: forwards), which makes
          it the containing block for position:fixed — so an inline modal would
          anchor to the sidebar-offset content column instead of the viewport.
          Rendering into <body> escapes that and centers it on the full screen. */}
      {liveSession && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            {/* Header / toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Globe className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Live Login — {liveSession.platform}
                  </p>
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">
                    Log in below (solve any 2FA / CAPTCHA), then Save Session.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <LiveCountdown expiresAt={liveSession.expiresAt} />
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={saveLiveLogin}
                  disabled={liveSaving}
                >
                  {liveSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save Session
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  title="Open the login window in a new browser tab"
                  onClick={() =>
                    window.open(liveSession.viewerUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New tab</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-rose-400"
                  onClick={cancelLiveLogin}
                  disabled={liveSaving}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
              </div>
            </div>

            {liveError && (
              <div className="border-b border-rose-500/20 bg-rose-500/5 px-4 py-2 sm:px-5">
                <p className="text-xs text-rose-400">{liveError}</p>
              </div>
            )}

            {/* The streamed login browser */}
            <iframe
              src={liveSession.viewerUrl}
              title={`Live login to ${liveSession.platform}`}
              className="min-h-0 flex-1 border-0 bg-black"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>,
          document.body
        )}
    </>
  );
}

// Counts down to the live-login session's auto-teardown (15 min server TTL) so
// the user knows how long the embedded login window stays open.
function LiveCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = Math.max(0, expiresAt - now);
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  return (
    <span
      className="hidden items-center rounded-md border border-border bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-flex"
      title="The login window auto-closes when this reaches zero"
    >
      {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

// Sticky in-page section navigation with scrollspy. On desktop it sits as a
// sticky left rail; on mobile it collapses to a horizontally scrollable bar
// pinned under the header. Clicking an entry smooth-scrolls to its section.
function SettingsNav({
  sections,
}: {
  sections: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Active zone: just below the sticky header down to ~40% of the viewport.
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/85 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:top-20 lg:mx-0 lg:w-56 lg:shrink-0 lg:self-start lg:rounded-xl lg:border lg:bg-card lg:px-2 lg:py-3 lg:backdrop-blur-none">
      <p className="mb-2 hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
        On this page
      </p>
      <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleClick(s.id)}
              className={cn(
                "group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 lg:w-full",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary lg:block" />
              )}
              <s.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  children,
  onSave,
  saved,
  saving,
}: {
  id?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave?: () => void;
  saved?: boolean;
  saving?: boolean;
}) {
  return (
    <Card id={id} className="overflow-hidden p-0 scroll-mt-20 lg:scroll-mt-24">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
      {onSave && (
        <div className="flex items-center justify-end border-t border-border px-5 py-3">
          <Button
            size="sm"
            className={cn(
              "gap-1.5 transition-all",
              saved
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "shadow-sm shadow-primary/25"
            )}
            onClick={onSave}
            disabled={saved || saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className={cn("h-3.5 w-3.5", saved && "hidden")} />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ToggleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        enabled ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function KeywordSection({
  title,
  subtitle,
  keywords,
  color,
  onAdd,
  onRemove,
}: {
  title: string;
  subtitle: string;
  keywords: string[];
  color: "emerald" | "amber" | "rose";
  onAdd: (keyword: string) => void;
  onRemove: (keyword: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [search, setSearch] = useState("");

  const filtered = search
    ? keywords.filter((kw) => kw.toLowerCase().includes(search.toLowerCase()))
    : keywords;

  const colorMap = {
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
    },
    amber: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      text: "text-amber-400",
    },
    rose: {
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      text: "text-rose-400",
    },
  };

  const c = colorMap[color];

  const handleAdd = () => {
    if (newKeyword.trim()) {
      onAdd(newKeyword);
      setNewKeyword("");
      setAdding(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            {subtitle} — {keywords.length} keywords
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 h-7"
          onClick={() => setAdding(!adding)}
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {adding ? "Cancel" : "Add"}
        </Button>
      </div>
      {adding && (
        <div className="flex items-center gap-2 mb-2 animate-fade-in">
          <Input
            type="text"
            placeholder="Enter a keyword..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-8 text-xs bg-secondary/50 border-border flex-1"
            autoFocus
          />
          <Button size="sm" className="h-8 gap-1" onClick={handleAdd}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      )}
      {keywords.length > 0 && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs bg-secondary/50 border-border pl-8"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((kw) => (
          <span
            key={kw}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              c.bg,
              c.border,
              c.text
            )}
          >
            {kw}
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
              onClick={() => onRemove(kw)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {keywords.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No keywords yet. Click Add to create one.</p>
        )}
        {keywords.length > 0 && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No keywords matching &ldquo;{search}&rdquo;</p>
        )}
      </div>
    </div>
  );
}

function ScoreRule({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "rose";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2.5">
      <span className="text-sm text-foreground/80">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-bold",
          color === "emerald" ? "text-emerald-400" : "text-rose-400"
        )}
      >
        {value}
      </span>
    </div>
  );
}
