"use client";

import { useState } from "react";
import { Header, ActionButton } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformConfigs as initialConfigs } from "@/lib/mock-data";
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
} from "lucide-react";

const primaryKeywords = [
  "looking for a virtual assistant",
  "hiring a virtual assistant",
  "need a VA",
  "hiring remote assistant",
  "hiring GHL VA",
  "need someone to manage my CRM",
  "hiring immediately VA",
];

const secondaryKeywords = [
  "any VA recommendations",
  "how much does a VA cost",
  "thinking of hiring a VA",
  "overwhelmed with admin",
  "need extra help in my business",
];

const negativeKeywords = [
  "I am looking for a VA job",
  "I'm a virtual assistant",
  "offering VA services",
  "hire me",
  "VA available",
];

export default function SettingsPage() {
  const [configs, setConfigs] = useState(initialConfigs);
  const [threshold, setThreshold] = useState(80);
  const [webhookUrl, setWebhookUrl] = useState(
    "https://discord.com/api/webhooks/..."
  );
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  const togglePlatform = (platform: Platform) => {
    setConfigs((prev) =>
      prev.map((c) =>
        c.platform === platform ? { ...c, enabled: !c.enabled } : c
      )
    );
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <Header
        title="Settings"
        subtitle="Configure monitoring and alert preferences"
        actions={
          <ActionButton icon={Save} onClick={handleSave}>
            {saved ? "Saved!" : "Save Changes"}
          </ActionButton>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Platform Monitoring */}
        <SettingsSection
          icon={Radio}
          title="Platform Monitoring"
          description="Toggle detection for each supported platform"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {configs.map((config) => {
              const color = getPlatformColor(config.platform);
              return (
                <div
                  key={config.platform}
                  className={cn(
                    "relative flex items-center justify-between rounded-xl border p-4 transition-all cursor-pointer",
                    config.enabled
                      ? "border-border bg-accent/30"
                      : "border-border bg-card opacity-60"
                  )}
                  onClick={() => togglePlatform(config.platform)}
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
                        {config.platform}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {config.totalDetected} leads detected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {config.enabled && (
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                        <span className="text-xs text-emerald-400 font-medium">
                          Active
                        </span>
                      </div>
                    )}
                    <ToggleSwitch
                      enabled={config.enabled}
                      onChange={() => togglePlatform(config.platform)}
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
              keywords={primaryKeywords}
              color="emerald"
            />
            <KeywordSection
              title="Secondary Keywords"
              subtitle="Medium-intent signals (+20 score)"
              keywords={secondaryKeywords}
              color="amber"
            />
            <KeywordSection
              title="Negative Keywords"
              subtitle="Noise filter (-40 score)"
              keywords={negativeKeywords}
              color="rose"
            />
          </div>
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection
          icon={Bell}
          title="Notifications"
          description="Configure how and where alerts are delivered"
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
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
}: {
  title: string;
  subtitle: string;
  keywords: string[];
  color: "emerald" | "amber" | "rose";
}) {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1 h-7">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
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
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
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
