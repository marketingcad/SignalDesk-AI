"use client";

import { useState, useEffect } from "react";
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
  Bell,
  Shield,
  Globe,
  Plus,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";

type KeywordCategory = "high_intent" | "medium_intent" | "negative";
type KeywordsState = Record<KeywordCategory, string[]>;

const ALL_PLATFORMS: Platform[] = ["Facebook", "LinkedIn", "Reddit", "X", "Other"];

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

  // --- Notification state ---
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [discordEnabled, setDiscordEnabled] = useState(true);

  // --- UI state ---
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
            setPlatformToggles(settings.platform_toggles);
          }
          if (settings.alert_threshold) {
            setThreshold(settings.alert_threshold.value);
          }
          if (settings.notifications) {
            setDiscordEnabled(settings.notifications.discord_enabled);
            setEmailEnabled(settings.notifications.email_enabled);
            setWebhookUrl(settings.notifications.discord_webhook_url || "");
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
  }, []);

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
      case "notifications":
        key = "notifications";
        value = {
          discord_enabled: discordEnabled,
          email_enabled: emailEnabled,
          discord_webhook_url: webhookUrl,
        };
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
      <div className="p-4 space-y-4 md:p-6 md:space-y-6 max-w-7xl mx-auto">
        {/* Platform Monitoring */}
        <SettingsSection
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

        {/* Intent Threshold */}
        <SettingsSection
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

        {/* Keywords */}
        <SettingsSection
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

        {/* Notifications */}
        <SettingsSection
          icon={Bell}
          title="Notifications"
          description="Configure how and where alerts are delivered"
          onSave={() => handleSectionSave("notifications")}
          saved={savedSection === "notifications"}
          saving={savingSection === "notifications"}
        >
          <div className="space-y-4">
            {/* Discord */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-accent/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#5865F2]/10">
                  <span className="text-lg">💬</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Discord Webhook
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receive real-time alerts in Discord
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={discordEnabled}
                onChange={() => setDiscordEnabled(!discordEnabled)}
              />
            </div>
            {discordEnabled && (
              <div className="pl-4 animate-fade-in">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Webhook URL
                </label>
                <Input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="font-mono bg-secondary/50 border-border"
                />
              </div>
            )}

            {/* Email */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-accent/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-lg">📧</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Email Summary
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receive daily batch report via email
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={emailEnabled}
                onChange={() => setEmailEnabled(!emailEnabled)}
              />
            </div>
          </div>
        </SettingsSection>

        {/* Scoring Rules */}
        <SettingsSection
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
    </>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  onSave,
  saved,
  saving,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave?: () => void;
  saved?: boolean;
  saving?: boolean;
}) {
  return (
    <Card className="overflow-hidden p-0">
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
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
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
