"use client";

import { useEffect, useState, useCallback } from "react";
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
 * On app startup (desktop only), checks if browser auth cookies exist.
 * If not, shows a modal prompting the user to log in to social platforms.
 * The auth is needed for the scraper to access Facebook/LinkedIn/Twitter.
 */
export function DesktopAuthPrompt() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [authRunning, setAuthRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Check auth status on mount
  useEffect(() => {
    const desktop = isTauri();
    setIsDesktop(desktop);
    if (!desktop) return;

    checkAuthStatus()
      .then(setAuthStatus)
      .catch(() => {});
  }, []);

  // Poll auth login process status while it's running
  useEffect(() => {
    if (!authRunning) return;

    const interval = setInterval(async () => {
      try {
        const status = await checkAuthLoginStatus();
        if (!status.running) {
          setAuthRunning(false);
          setMessage("");
          // Re-check auth status after login completes
          const newStatus = await checkAuthStatus();
          setAuthStatus(newStatus);
          if (newStatus.authenticated) {
            setMessage("Login saved successfully!");
            setTimeout(() => setDismissed(true), 2000);
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [authRunning]);

  const handleLogin = useCallback(async (platform?: string) => {
    setLaunching(true);
    setError("");
    try {
      const result = await launchAuthLogin(platform);
      setMessage(result);
      setAuthRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  }, []);

  // Don't show if: not desktop, already authenticated, or dismissed
  if (!isDesktop || dismissed || !authStatus || authStatus.authenticated) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-lg border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
            <Shield className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Browser Login Required
            </h2>
            <p className="text-sm text-muted-foreground">
              The scraper needs access to social platforms
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4">
          To scrape leads from Facebook, LinkedIn, and Twitter, you need to log
          in once. This opens a browser where you can sign in — your session is
          saved locally for future use.
        </p>

        {/* Status messages */}
        {message && (
          <div className="flex items-center gap-2 mb-4 p-2 rounded bg-primary/10 text-primary text-sm">
            {authRunning ? (
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            ) : (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mb-4 p-2 rounded bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login buttons */}
        {!authRunning && (
          <div className="space-y-2 mb-4">
            <button
              onClick={() => handleLogin()}
              disabled={launching}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium"
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
                    className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent transition-colors disabled:opacity-50 capitalize"
                  >
                    {platform}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Skip button */}
        <button
          onClick={() => setDismissed(true)}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {authRunning ? "Hide (login continues in background)" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}
