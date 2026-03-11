"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Globe,
  Link2,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  User,
  Copy,
  ArrowRight,
  FileSearch,
  Layers,
  BadgeCheck,
  Clock,
  Sparkles,
  ChevronRight,
  Hash,
} from "lucide-react";

type ScrapeResult = {
  success?: boolean;
  platform?: string;
  postsFound?: number;
  inserted?: number;
  duplicates?: number;
  batch?: { inserted: number; duplicates: number };
  error?: string;
  scrapedPosts?: { author: string; text: string; url: string; platform: string }[];
};

type HistoryEntry = {
  url: string;
  platform?: string;
  postsFound: number;
  inserted: number;
  duplicates: number;
  timestamp: Date;
  error?: string;
};

const PLATFORM_EXAMPLES = [
  {
    name: "Facebook",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    dot: "bg-blue-400",
    examples: [
      "https://www.facebook.com/groups/123456/",
      "https://www.facebook.com/pages/example-page/",
    ],
    tip: "Groups & pages with buying intent discussions",
  },
  {
    name: "LinkedIn",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    dot: "bg-sky-400",
    examples: [
      "https://www.linkedin.com/posts/...",
      "https://www.linkedin.com/feed/update/...",
    ],
    tip: "Professional posts signaling hiring or outsourcing",
  },
  {
    name: "Reddit",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    dot: "bg-orange-400",
    examples: [
      "https://www.reddit.com/r/entrepreneur/",
      "https://www.reddit.com/r/smallbusiness/comments/...",
    ],
    tip: "Subreddits & threads about hiring or delegation",
  },
  {
    name: "X (Twitter)",
    color: "text-zinc-300",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
    dot: "bg-zinc-300",
    examples: [
      "https://x.com/username",
      "https://twitter.com/username/status/...",
    ],
    tip: "Profiles & tweets about needing virtual assistants",
  },
];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-border bg-card p-4 flex items-center gap-3">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
      </div>
    </Card>
  );
}

export default function ScrapeUrlPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/leads/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data: ScrapeResult = await res.json();

      if (!res.ok) {
        const entry: HistoryEntry = {
          url: trimmed,
          postsFound: 0,
          inserted: 0,
          duplicates: 0,
          timestamp: new Date(),
          error: data.error || "Failed to scrape",
        };
        setResult({ error: data.error || "Failed to scrape URL" });
        setHistory((prev) => [entry, ...prev]);
      } else {
        const entry: HistoryEntry = {
          url: trimmed,
          platform: data.platform,
          postsFound: data.postsFound ?? 0,
          inserted: data.batch?.inserted ?? (data.inserted ?? 0),
          duplicates: data.batch?.duplicates ?? (data.duplicates ?? 0),
          timestamp: new Date(),
        };
        setResult({
          success: true,
          platform: data.platform,
          postsFound: data.postsFound,
          inserted: data.batch?.inserted ?? (data.inserted ?? 0),
          duplicates: data.batch?.duplicates ?? (data.duplicates ?? 0),
          scrapedPosts: data.scrapedPosts || [],
        });
        setHistory((prev) => [entry, ...prev]);
      }
    } catch {
      const entry: HistoryEntry = {
        url: trimmed,
        postsFound: 0,
        inserted: 0,
        duplicates: 0,
        timestamp: new Date(),
        error: "Could not reach scraper service",
      };
      setResult({ error: "Could not reach scraper service" });
      setHistory((prev) => [entry, ...prev]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleExampleClick = (example: string) => {
    setUrl(example);
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <Header
        title="Scrape URL"
        subtitle="Extract buying-intent leads directly from any supported platform URL"
      />

      {/* ── Input Card ─────────────────────────────────────────────── */}
      <Card className="border-border bg-card">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Paste a URL to scrape</p>
              <p className="text-xs text-muted-foreground">
                Supports Facebook, LinkedIn, Reddit, and X profiles or posts
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                placeholder="https://www.facebook.com/groups/... or any supported URL"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setResult(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleScrape(); }}
                className="pl-9 bg-secondary/50 border-border h-10 text-sm"
                disabled={loading}
                autoFocus
              />
            </div>
            <Button
              onClick={handleScrape}
              disabled={loading || !url.trim()}
              className="gap-2 px-5 h-10 shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scraping…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Scrape
                </>
              )}
            </Button>
          </div>

          {/* Platform pills */}
          <div className="flex flex-wrap gap-2">
            {PLATFORM_EXAMPLES.map((p) => (
              <span
                key={p.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  p.bg,
                  p.border,
                  p.color
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
                {p.name}
              </span>
            ))}
          </div>

          {/* Loading progress indicator */}
          {loading && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3 animate-fade-in">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Scraping in progress…</p>
                <p className="text-xs text-muted-foreground">
                  This may take up to a few minutes depending on the page size.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Result Stats ───────────────────────────────────────────── */}
      {result && !result.error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
          <StatCard
            label="Posts Found"
            value={result.postsFound ?? 0}
            icon={FileSearch}
            color="bg-primary/10 text-primary"
          />
          <StatCard
            label="New Leads"
            value={result.inserted ?? 0}
            icon={Sparkles}
            color="bg-emerald-500/10 text-emerald-400"
          />
          <StatCard
            label="Duplicates"
            value={result.duplicates ?? 0}
            icon={Layers}
            color="bg-amber-500/10 text-amber-400"
          />
          <StatCard
            label="Platform"
            value={result.platform ?? "—"}
            icon={BadgeCheck}
            color="bg-sky-500/10 text-sky-400"
          />
        </div>
      )}

      {/* ── Error Banner ───────────────────────────────────────────── */}
      {result?.error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-rose-400">Scrape failed</p>
            <p className="text-xs text-rose-400/80">{result.error}</p>
          </div>
        </div>
      )}

      {/* ── Main Results + History Grid ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Scraped Posts Panel */}
        <div className="space-y-3">
          {result?.success && result.scrapedPosts && result.scrapedPosts.length > 0 ? (
            <Card className="border-border bg-card overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-foreground">
                    Scraped Posts
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {result.scrapedPosts.length}
                  </span>
                </div>
                <Link
                  href="/leads"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  View in Leads
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
                {result.scrapedPosts.map((post, idx) => (
                  <div
                    key={idx}
                    className="px-4 py-3 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-[10px] font-mono text-muted-foreground shrink-0 w-5 text-right">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-semibold text-foreground truncate">
                            {post.author}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                          {post.text}
                        </p>
                        {post.url && (
                          <div className="flex items-center gap-2">
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 hover:underline transition-colors"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-xs">{post.url}</span>
                            </a>
                            <button
                              onClick={() => handleCopy(post.url)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Copy URL"
                            >
                              {copied === post.url ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : !result ? (
            /* Empty state — platform guide */
            <Card className="border-border bg-card">
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Supported Platforms</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLATFORM_EXAMPLES.map((p) => (
                    <div
                      key={p.name}
                      className={cn(
                        "rounded-lg border p-3 space-y-2",
                        p.bg,
                        p.border
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                        <span className={cn("text-xs font-semibold", p.color)}>{p.name}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{p.tip}</p>
                      <div className="space-y-1">
                        {p.examples.map((ex) => (
                          <button
                            key={ex}
                            onClick={() => handleExampleClick(ex)}
                            className="flex w-full items-center gap-1.5 text-left group/ex"
                            title="Use this example"
                          >
                            <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-[11px] text-muted-foreground group-hover/ex:text-foreground truncate transition-colors">
                              {ex}
                            </span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/ex:opacity-100 shrink-0 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        {/* Session History Panel */}
        <div>
          <Card className="border-border bg-card overflow-hidden h-full">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Session History</span>
              </div>
              {history.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {history.length}
                </span>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                <Globe className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No scrapes yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Scraped URLs will appear here during this session.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
                {history.map((entry, idx) => (
                  <div key={idx} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => { setUrl(entry.url); setResult(null); }}
                        className="text-[11px] text-primary hover:text-primary/80 hover:underline text-left truncate transition-colors"
                        title={entry.url}
                      >
                        {entry.url}
                      </button>
                      {entry.error ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      )}
                    </div>

                    {entry.error ? (
                      <p className="text-[10px] text-rose-400 leading-snug line-clamp-2">
                        {entry.error}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {entry.platform && (
                          <span className="text-[10px] text-muted-foreground">{entry.platform}</span>
                        )}
                        <span className="text-[10px] text-foreground font-medium">
                          {entry.postsFound} posts
                        </span>
                        <span className="text-[10px] text-emerald-400">
                          +{entry.inserted} leads
                        </span>
                        {entry.duplicates > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {entry.duplicates} dupes
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground/60">
                      {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Tips ───────────────────────────────────────────────────── */}
      <Card className="border-border bg-card">
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tips for best results
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: Globe,
                title: "Use public URLs",
                desc: "Make sure the URL points to a publicly accessible page or group. Private or login-required pages may not scrape correctly.",
              },
              {
                icon: Layers,
                title: "Duplicates are safe",
                desc: "Re-scraping the same URL is harmless. Duplicate posts are detected automatically and won't create extra lead entries.",
              },
              {
                icon: Sparkles,
                title: "Check Leads after scraping",
                desc: "New leads are automatically scored for buying intent. Head to the Leads page to review, qualify, or contact them.",
              },
            ].map((tip) => (
              <div key={tip.title} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                <tip.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">{tip.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
