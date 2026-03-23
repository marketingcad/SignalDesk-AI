"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  isTauri,
  checkAuthStatus,
  launchAuthLogin,
  checkAuthLoginStatus,
  type AuthStatus,
} from "@/lib/tauri";
import {
  Shield,
  LogIn,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

/**
 * Desktop Auth Prompt
 *
 * On every app startup (desktop only), shows a modal prompting the user
 * to log in to social platforms. This ensures fresh browser sessions for
 * the scraper to access Facebook/LinkedIn/Twitter.
 */
export function DesktopAuthPrompt() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [authRunning, setAuthRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check auth status on mount — with a small delay to let Tauri bridge init
  useEffect(() => {
    const desktop = isTauri();
    setIsDesktop(desktop);
    if (!desktop) {
      setChecked(true);
      return;
    }

    // Delay check slightly to ensure Tauri IPC bridge is ready
    const timer = setTimeout(async () => {
      try {
        const status = await checkAuthStatus();
        console.log("[auth-prompt] Auth status:", status);
        setAuthStatus(status);
      } catch (err) {
        console.error("[auth-prompt] Failed to check auth status:", err);
        // If the command fails, assume not authenticated to show the prompt
        setAuthStatus({
          authenticated: false,
          hasStorageState: false,
          hasProfile: false,
          hasEnvVar: false,
        });
      } finally {
        setChecked(true);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Poll auth login process status while it's running
  useEffect(() => {
    if (!authRunning) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await checkAuthLoginStatus();
        if (!status.running) {
          setAuthRunning(false);
          setMessage("");
          if (pollRef.current) clearInterval(pollRef.current);
          // Re-check auth status after login completes.
          // Try immediately first (works on macOS where no file locks).
          // On Windows, Chromium may still hold file locks after exit,
          // so retry a few times with delays if the immediate check fails.
          let authenticated = false;
          try {
            const immediateStatus = await checkAuthStatus();
            setAuthStatus(immediateStatus);
            authenticated = immediateStatus.authenticated;
          } catch {
            // ignore, will retry below
          }
          if (!authenticated) {
            for (let attempt = 0; attempt < 4; attempt++) {
              await new Promise((r) => setTimeout(r, 2000));
              try {
                const newStatus = await checkAuthStatus();
                setAuthStatus(newStatus);
                if (newStatus.authenticated) {
                  authenticated = true;
                  break;
                }
              } catch {
                // ignore check errors, retry
              }
            }
          }
          if (authenticated) {
            setMessage("Login saved successfully! You can now scrape.");
            setTimeout(() => setDismissed(true), 3000);
          } else {
            setError("Login completed but cookies were not saved. Try again.");
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [authRunning]);

  const handleLogin = useCallback(async (platform?: string) => {
    setLaunching(true);
    setError("");
    setMessage("");
    try {
      const result = await launchAuthLogin(platform);
      console.log("[auth-prompt] Launch result:", result);
      setMessage(result);
      setAuthRunning(true);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[auth-prompt] Failed to launch auth:", errMsg);
      setError(errMsg);
    } finally {
      setLaunching(false);
    }
  }, []);

  // Don't show if: not desktop, not checked yet, or dismissed
  // Always show on launch — even if already authenticated — so the user
  // can refresh their browser sessions each time they open the app.
  if (!isDesktop || !checked || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-lg border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${authStatus?.authenticated ? "bg-primary/10" : "bg-amber-500/10"}`}>
            <Shield className={`h-5 w-5 ${authStatus?.authenticated ? "text-primary" : "text-amber-500"}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {authStatus?.authenticated ? "Browser Login" : "Browser Login Required"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {authStatus?.authenticated
                ? "Refresh your social platform sessions"
                : "The scraper needs access to social platforms"}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4">
          {authStatus?.authenticated
            ? "You have saved sessions. Log in again to refresh your cookies, or skip to use existing sessions."
            : "To scrape leads from Facebook, LinkedIn, and Twitter, you need to log in. This opens a browser where you can sign in — your session is saved locally."}
        </p>

        {/* Status messages */}
        {message && (
          <div className="flex items-center gap-2 mb-4 p-2 rounded bg-primary/10 text-primary text-sm">
            {authRunning ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <CheckCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mb-4 p-2 rounded bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login buttons */}
        {!authRunning && (
          <div className="space-y-2 mb-4">
            <button
              onClick={() => handleLogin()}
              disabled={launching}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium cursor-pointer"
            >
              {launching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {launching ? "Opening browser..." : "Login to All Platforms"}
            </button>

            <div className="grid grid-cols-3 gap-2">
              {(["facebook", "linkedin", "twitter"] as const).map(
                (platform) => (
                  <button
                    key={platform}
                    onClick={() => handleLogin(platform)}
                    disabled={launching}
                    className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent transition-colors disabled:opacity-50 capitalize cursor-pointer"
                  >
                    {platform}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* While auth is running */}
        {authRunning && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded bg-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Browser is open</p>
              <p className="text-xs text-muted-foreground">Log in to your accounts, then close the browser window.</p>
            </div>
          </div>
        )}

        {/* Skip button */}
        <button
          onClick={() => setDismissed(true)}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
        >
          {authRunning
            ? "Hide (login continues in background)"
            : authStatus?.authenticated
              ? "Use existing sessions"
              : "Skip for now"}
        </button>
      </div>
    </div>
  );
}
