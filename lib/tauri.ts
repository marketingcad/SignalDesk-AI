/**
 * Tauri Desktop Integration
 *
 * Provides type-safe wrappers for Tauri IPC commands and updater API.
 * Falls back gracefully when running in a browser (non-desktop) context.
 */

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ---------------------------------------------------------------------------
// IPC Commands (calls into Rust backend)
// ---------------------------------------------------------------------------

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("Not running in Tauri");
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

export interface BackendStatus {
  nextjs: boolean;
  scraper: boolean;
}

export async function getBackendStatus(): Promise<BackendStatus> {
  return invoke<BackendStatus>("get_backend_status");
}

export async function restartServices(): Promise<string> {
  return invoke<string>("restart_services");
}

// ---------------------------------------------------------------------------
// Cloudflare Tunnel
// ---------------------------------------------------------------------------

export async function startTunnel(): Promise<string> {
  return invoke<string>("start_tunnel");
}

export async function stopTunnel(): Promise<string> {
  return invoke<string>("stop_tunnel");
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

export interface UpdateResult {
  available: boolean;
  version?: string;
  body?: string;
  date?: string;
}

export async function checkForUpdate(): Promise<UpdateResult> {
  if (!isTauri()) return { available: false };

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update) {
      return {
        available: true,
        version: update.version,
        body: update.body ?? undefined,
        date: update.date ?? undefined,
      };
    }
    return { available: false };
  } catch (err) {
    console.error("[updater] Check failed:", err);
    return { available: false };
  }
}

export async function installUpdate(): Promise<void> {
  if (!isTauri()) return;

  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");

  const update = await check();
  if (update) {
    await update.downloadAndInstall();
    await relaunch();
  }
}
