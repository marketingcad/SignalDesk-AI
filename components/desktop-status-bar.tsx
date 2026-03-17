"use client";

import { useEffect, useState, useCallback } from "react";
import {
  isTauri,
  getAppVersion,
  getBackendStatus,
  checkForUpdate,
  installUpdate,
  restartServices,
  type BackendStatus,
  type UpdateResult,
} from "@/lib/tauri";
import {
  Monitor,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Wifi,
} from "lucide-react";

export function DesktopStatusBar() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [update, setUpdate] = useState<UpdateResult>({ available: false });
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const desktop = isTauri();
    setIsDesktop(desktop);
    if (!desktop) return;

    // Reserve space for the status bar
    document.documentElement.style.setProperty("--desktop-statusbar-height", "32px");

    getAppVersion().then(setVersion).catch(() => {});

    // Check backend status every 5s
    const poll = () => {
      getBackendStatus().then(setStatus).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);

    // Auto-check for updates on launch
    checkForUpdate().then(setUpdate).catch(() => {});

    return () => clearInterval(interval);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkForUpdate();
      setUpdate(result);
    } finally {
      setChecking(false);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    setInstalling(true);
    try {
      await installUpdate();
    } catch (err) {
      console.error("Update install failed:", err);
      setInstalling(false);
    }
  }, []);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await restartServices();
      // Wait a bit then re-poll status
      setTimeout(() => {
        getBackendStatus().then(setStatus).catch(() => {});
        setRestarting(false);
      }, 3000);
    } catch {
      setRestarting(false);
    }
  }, []);

  if (!isDesktop) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-border bg-card/95 backdrop-blur px-4 py-1.5 text-xs text-muted-foreground">
      {/* Left: App info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Monitor className="h-3 w-3" />
          <span className="font-medium text-foreground">VA Hub</span>
          {version && (
            <span className="text-muted-foreground">v{version}</span>
          )}
        </div>

        {/* Service status indicators */}
        <div className="flex items-center gap-2 ml-2">
          <StatusDot
            label="Next.js"
            ok={status?.nextjs ?? false}
            loading={!status}
          />
          <StatusDot
            label="Scraper"
            ok={status?.scraper ?? false}
            loading={!status}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Restart services */}
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-accent transition-colors disabled:opacity-50"
          title="Restart backend services"
        >
          <RefreshCw className={`h-3 w-3 ${restarting ? "animate-spin" : ""}`} />
          <span>Restart</span>
        </button>

        {/* Update section */}
        {update.available ? (
          <button
            onClick={handleInstallUpdate}
            disabled={installing}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {installing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            <span>
              {installing
                ? "Installing..."
                : `Update to v${update.version}`}
            </span>
          </button>
        ) : (
          <button
            onClick={handleCheckUpdate}
            disabled={checking}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-accent transition-colors disabled:opacity-50"
            title="Check for updates"
          >
            {checking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wifi className="h-3 w-3" />
            )}
            <span>{checking ? "Checking..." : "Check Updates"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function StatusDot({
  label,
  ok,
  loading,
}: {
  label: string;
  ok: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-1" title={`${label}: ${loading ? "checking" : ok ? "running" : "stopped"}`}>
      {loading ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
      ) : ok ? (
        <CheckCircle className="h-2.5 w-2.5 text-emerald-400" />
      ) : (
        <XCircle className="h-2.5 w-2.5 text-red-400" />
      )}
      <span>{label}</span>
    </div>
  );
}
