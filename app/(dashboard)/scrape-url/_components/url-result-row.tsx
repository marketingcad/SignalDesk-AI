"use client";

import { useState, useEffect } from "react";
import { openUrl } from "@/lib/open-url";
import { isTauri, launchAuthLogin, checkAuthLoginStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import {
  Loader2, CheckCircle2, ExternalLink, User, XCircle,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { PlatformBadge } from "./platform-badge";
import type { UrlItemResult } from "./shared";

export function UrlResultRow({
  item,
  index,
  onRetry,
}: {
  item: UrlItemResult;
  index: number;
  onRetry?: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [authLaunching, setAuthLaunching] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const hasError = !item.success || !!item.error;
  const errorMsg = item.error ?? item.errors?.[0] ?? "";
  const needsLogin = errorMsg.toLowerCase().includes("requires login");
  const posts = item.scrapedPosts ?? [];

  useEffect(() => { setDesktop(isTauri()); }, []);

  const handleAuthLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!desktop) return;
    setAuthLaunching(true);
    try {
      const p = item.platform?.toLowerCase();
      const platform = p === "x / twitter" || p === "twitter" || p === "x" ? "twitter" : p ?? undefined;
      await launchAuthLogin(platform);
      const poll = setInterval(async () => {
        try {
          const status = await checkAuthLoginStatus();
          if (!status.running) {
            clearInterval(poll);
            setAuthLaunching(false);
          }
        } catch { clearInterval(poll); setAuthLaunching(false); }
      }, 2000);
    } catch (err) {
      console.error("[scrape-url] Auth login failed:", err);
      setAuthLaunching(false);
    }
  };

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      hasError ? "border-rose-500/20 bg-rose-500/5" : "border-border bg-card"
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">{index + 1}</span>
        {hasError
          ? <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
        <span className="flex-1 text-xs text-muted-foreground truncate font-mono" title={item.url}>{item.url}</span>
        <PlatformBadge platform={item.platform ?? null} />
        {!hasError && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-foreground font-medium">{item.postsFound ?? 0} posts</span>
            <span className="text-xs text-emerald-400 font-semibold">+{item.batch?.inserted ?? 0} leads</span>
            {(item.batch?.duplicates ?? 0) > 0 &&
              <span className="text-xs text-muted-foreground">{item.batch?.duplicates} dupes</span>}
          </div>
        )}
        {hasError && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-rose-400 truncate max-w-50">
              {needsLogin ? `${item.platform ?? "Platform"} requires login` : errorMsg || "Failed"}
            </span>
            {needsLogin && desktop && (
              <button
                type="button"
                onClick={handleAuthLogin}
                disabled={authLaunching}
                className="relative z-10 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {authLaunching ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Logging in...</>
                ) : (
                  <><User className="h-3 w-3" /> Open Login</>
                )}
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRetry(item.url); }}
                className="relative z-10 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-border bg-muted/50 text-foreground hover:bg-muted transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        )}
        {posts.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {expanded && posts.length > 0 && (
        <div className="border-t border-border divide-y divide-border bg-muted/20">
          {posts.map((post, pi) => (
            <div key={pi} className="px-4 py-2.5 flex items-start gap-3">
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-5 text-right pt-0.5">{pi + 1}.</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-semibold text-foreground">{post.author}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{post.text}</p>
                {post.url && (
                  <button onClick={() => openUrl(post.url)}
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <ExternalLink className="h-2.5 w-2.5" />
                    <span className="truncate max-w-xs">{post.url}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
