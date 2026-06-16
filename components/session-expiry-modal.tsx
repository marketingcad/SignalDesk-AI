"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, KeyRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Platforms that require a logged-in browser session (cookies) to scrape.
const AUTH_PLATFORMS = ["Facebook", "LinkedIn"];
// Suppress the prompt for the rest of this browser session once dismissed, so it
// shows ~once per login instead of on every page navigation.
const DISMISS_KEY = "sd_session_expiry_dismissed";
const RECHECK_MS = 5 * 60_000;

interface PlatformHealth {
  platform: string;
  status: "healthy" | "warning" | "expired";
}

interface AuthStatus {
  cookiesSaved: boolean;
  health: { overall: string; platforms: PlatformHealth[] } | null;
}

/**
 * Global guard that pops a blocking modal when a platform scraping session has
 * expired (or was wiped — e.g. after a scraper redeploy) so the user knows to
 * re-authenticate instead of silently collecting zero leads. Mounted once in the
 * dashboard layout.
 */
export function SessionExpiryModal() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [noSession, setNoSession] = useState(false);

  const check = useCallback(async () => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") return;
    try {
      const [authRes, settingsRes] = await Promise.all([
        fetch("/api/auth/browser-login"),
        fetch("/api/settings"),
      ]);
      if (!authRes.ok) return; // scraper unreachable / unauthorized — stay quiet
      const auth = (await authRes.json()) as AuthStatus;
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const toggles: Record<string, boolean> = settings?.platform_toggles ?? {};

      // Only consider auth platforms the user actually has enabled.
      const enabledAuth = AUTH_PLATFORMS.filter((p) => toggles[p] ?? true);
      if (enabledAuth.length === 0) return;

      const expired = (auth.health?.platforms ?? [])
        .filter((p) => p.status === "expired" && enabledAuth.includes(p.platform))
        .map((p) => p.platform);

      // No saved session at all (e.g. wiped by a redeploy) → every enabled auth
      // platform needs a fresh login.
      if (auth.cookiesSaved === false) {
        setNoSession(true);
        setPlatforms(enabledAuth);
        setOpen(true);
      } else if (expired.length > 0) {
        setNoSession(false);
        setPlatforms(expired);
        setOpen(true);
      }
    } catch {
      // network error — don't nag
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, RECHECK_MS);
    // Re-check when the user returns to the tab (session may have lapsed meanwhile)
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  // Don't interrupt the user while they're already on Settings re-authenticating.
  if (pathname?.startsWith("/settings")) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  const reauthenticate = () => {
    setOpen(false);
    router.push("/settings#browser-login");
  };

  const platformLabel =
    platforms.length === 0
      ? "scraping"
      : platforms.length === 1
      ? platforms[0]
      : `${platforms.slice(0, -1).join(", ")} and ${platforms[platforms.length - 1]}`;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <AlertDialogTitle>Re-login required</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-1">
            {noSession ? (
              <>
                There’s no active <span className="font-medium text-foreground">{platformLabel}</span>{" "}
                login session. SignalDesk can’t collect new leads from{" "}
                {platforms.length > 1 ? "these platforms" : "this platform"} until you sign in again.
              </>
            ) : (
              <>
                Your <span className="font-medium text-foreground">{platformLabel}</span> scraping
                session has expired. New leads won’t be collected from{" "}
                {platforms.length > 1 ? "these platforms" : "this platform"} until you re-authenticate.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button onClick={reauthenticate} className="gap-2">
            <KeyRound className="h-4 w-4" />
            Re-authenticate
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            Later
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
