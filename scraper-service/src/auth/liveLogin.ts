/**
 * Live Login engine — a remote, viewable browser for interactive social login.
 *
 * On a headless cloud server you cannot pop open a visible browser for the user.
 * Instead we run a REAL (non-headless) Chromium on a virtual X display (Xvfb),
 * expose that display over VNC (x11vnc, localhost-only), and bridge it to the
 * browser with websockify + noVNC. The dashboard streams that view so the user
 * can log in to Facebook/LinkedIn/X by hand (solving 2FA / CAPTCHA themselves),
 * then we export the resulting cookies to the rolling session file the scrapers
 * read from.
 *
 * Security: every helper process binds to 127.0.0.1 only. The viewer is reachable
 * solely through the authenticated web app, gated by a one-time view token. A
 * single session at a time, auto-torn-down after SESSION_TTL_MS.
 */

import { spawn, ChildProcess } from "child_process";
import crypto from "crypto";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { STORAGE_STATE_PATH, saveSessionToSupabase } from "../crawler/browserAuth";

const DISPLAY = ":99";
const SCREEN = "1280x720x24"; // smaller virtual display = less Chromium/Xvfb memory
const VNC_PORT = 5900;
export const WEBSOCKIFY_PORT = 6080;
const NOVNC_WEB = "/usr/share/novnc";
const SESSION_TTL_MS = 15 * 60 * 1000; // auto-teardown after 15 minutes

const LOGIN_URLS: Record<string, string> = {
  facebook: "https://www.facebook.com/login",
  linkedin: "https://www.linkedin.com/login",
  x: "https://x.com/login",
};

type Session = {
  platform: string;
  viewToken: string;
  startedAt: number;
  expiresAt: number;
  xvfb: ChildProcess;
  x11vnc: ChildProcess;
  websockify: ChildProcess;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  ttlTimer: NodeJS.Timeout;
};

let current: Session | null = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Spawn a long-running helper process, logging its exit. */
function spawnHelper(name: string, cmd: string, args: string[]): ChildProcess {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr?.on("data", (d) =>
    console.log(`[live-login:${name}] ${String(d).trim()}`)
  );
  child.on("exit", (code) =>
    console.log(`[live-login:${name}] exited (${code})`)
  );
  return child;
}

/** Whether a live-login session is currently active. */
export function getLiveStatus() {
  if (!current) return { active: false as const };
  return {
    active: true as const,
    platform: current.platform,
    startedAt: current.startedAt,
    expiresAt: current.expiresAt,
  };
}

/** Constant-time view-token check used by the VNC proxy gate. */
export function verifyViewToken(token: string | undefined | null): boolean {
  if (!current || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(current.viewToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Start a live-login session: virtual display → visible Chromium → VNC stream.
 * Returns the one-time view token the dashboard needs to open the viewer.
 */
export async function startLiveLogin(
  platformRaw: string
): Promise<{ viewToken: string; platform: string; expiresAt: number }> {
  const platform = (platformRaw || "facebook").toLowerCase();
  if (!LOGIN_URLS[platform]) {
    throw new Error(`Unsupported platform '${platform}'`);
  }
  if (current) {
    throw new Error(
      "A login session is already active. Save or cancel it first."
    );
  }

  // 1) Virtual display
  const xvfb = spawnHelper("xvfb", "Xvfb", [
    DISPLAY,
    "-screen",
    "0",
    SCREEN,
    "-nolisten",
    "tcp",
  ]);
  await sleep(1500); // let the X server come up

  // 2) Real, visible Chromium painted onto the virtual display
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  try {
    browser = await chromium.launch({
      headless: false,
      env: { ...process.env, DISPLAY } as Record<string, string>,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        // Memory-reduction flags so the non-headless browser is less likely to
        // OOM the container (a 4 GB instance is still recommended for headroom).
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-renderer-backgrounding",
        "--js-flags=--max-old-space-size=512",
        "--start-maximized",
      ],
    });
    context = await browser.newContext({ viewport: null });
    page = await context.newPage();
    await page.goto(LOGIN_URLS[platform], { waitUntil: "domcontentloaded" });
  } catch (err) {
    xvfb.kill("SIGKILL");
    throw err;
  }

  // 3) Stream the display over VNC (localhost only, no extra password — the
  //    Express view-token + localhost binding are the security boundary).
  const x11vnc = spawnHelper("x11vnc", "x11vnc", [
    "-display",
    DISPLAY,
    "-nopw",
    "-localhost",
    "-forever",
    "-shared",
    "-rfbport",
    String(VNC_PORT),
    "-noxdamage",
    "-quiet",
  ]);

  // 4) Bridge VNC → WebSocket and serve the noVNC web client (localhost only)
  const websockify = spawnHelper("websockify", "websockify", [
    `--web=${NOVNC_WEB}`,
    `127.0.0.1:${WEBSOCKIFY_PORT}`,
    `127.0.0.1:${VNC_PORT}`,
  ]);

  const viewToken = crypto.randomBytes(24).toString("hex");
  const startedAt = Date.now();
  const expiresAt = startedAt + SESSION_TTL_MS;
  const ttlTimer = setTimeout(() => {
    console.log("[live-login] session TTL reached — tearing down");
    void teardown();
  }, SESSION_TTL_MS);

  current = {
    platform,
    viewToken,
    startedAt,
    expiresAt,
    xvfb,
    x11vnc,
    websockify,
    browser,
    context,
    page,
    ttlTimer,
  };

  console.log(`[live-login] started for ${platform} (expires in 15m)`);
  return { viewToken, platform, expiresAt };
}

/** Export the logged-in cookies to the rolling session file, then tear down. */
export async function saveLiveLogin(): Promise<{ cookiesSaved: boolean }> {
  if (!current) throw new Error("No active login session");
  await current.context.storageState({ path: STORAGE_STATE_PATH });
  console.log("[live-login] session saved → storage-state.json");
  // Persist durably so it survives redeploys (no manual BROWSER_STORAGE_STATE paste).
  await saveSessionToSupabase();
  await teardown();
  return { cookiesSaved: true };
}

/** Cancel without saving. */
export async function cancelLiveLogin(): Promise<void> {
  await teardown();
}

/** Stop the browser and all helper processes; clear state. */
async function teardown(): Promise<void> {
  const s = current;
  current = null;
  if (!s) return;
  clearTimeout(s.ttlTimer);
  try {
    await s.context.close();
  } catch {
    /* ignore */
  }
  try {
    await s.browser.close();
  } catch {
    /* ignore */
  }
  for (const proc of [s.websockify, s.x11vnc, s.xvfb]) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  console.log("[live-login] torn down");
}
