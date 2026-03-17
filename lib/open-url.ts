import { isTauri } from "./tauri";

/**
 * Opens a URL in the user's default browser.
 * Uses Tauri shell.open() in desktop mode, window.open() in browser mode.
 */
export async function openUrl(url: string): Promise<void> {
  if (!url) return;

  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank");
  }
}
