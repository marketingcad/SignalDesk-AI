import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { getSupabase } from "../db/supabase";

/** Durable session storage: one row in Supabase that survives redeploys. */
const SESSION_TABLE = "scraper_sessions";
const SESSION_ROW_ID = "default";

/**
 * Persistent browser profile directory (local dev).
 */
const PROFILE_DIR = path.resolve(__dirname, "../../auth/browser-profile");

/**
 * Exported storageState JSON file (portable — works on Render).
 * Exported so the Live Login engine writes the session to the same file the
 * scrapers read from via {@link getStorageState}.
 */
export const STORAGE_STATE_PATH = path.resolve(__dirname, "../../auth/storage-state.json");

/**
 * Check if auth is available — either local profile, storage-state file, or env var.
 */
export function hasSavedCookies(): boolean {
  if (process.env.BROWSER_STORAGE_STATE) return true;
  if (fs.existsSync(STORAGE_STATE_PATH)) return true;
  return fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0;
}

/**
 * Get the path to the persistent browser profile directory.
 */
export function getProfileDir(): string {
  return PROFILE_DIR;
}

export type AuthPlatformKey = "facebook" | "linkedin" | "x";

/**
 * Marker cookies that are only present (with a value) when the account is
 * actually logged in. This is the source of truth for "is THIS platform
 * authenticated", as opposed to the global hasSavedCookies()/health status —
 * the rolling session file holds cookies for several domains at once, so one
 * platform being logged in does not mean the others are.
 */
const AUTH_COOKIE_MARKERS: Record<AuthPlatformKey, { domain: string; name: string }[]> = {
  // c_user (user id) and xs (session secret) are both Facebook login cookies;
  // either one present means there's an active FB session.
  facebook: [
    { domain: "facebook.com", name: "c_user" },
    { domain: "facebook.com", name: "xs" },
  ],
  linkedin: [{ domain: "linkedin.com", name: "li_at" }],
  x: [
    { domain: "x.com", name: "auth_token" },
    { domain: "twitter.com", name: "auth_token" },
  ],
};

interface StoredCookie {
  name: string;
  value?: string;
  domain: string;
}

/** Read the raw rolling session JSON (file first, env bootstrap fallback). */
function readStorageStateRaw(): string | undefined {
  if (fs.existsSync(STORAGE_STATE_PATH)) return fs.readFileSync(STORAGE_STATE_PATH, "utf-8");
  if (process.env.BROWSER_STORAGE_STATE) return process.env.BROWSER_STORAGE_STATE;
  return undefined;
}

/**
 * Inspect the saved session and report which platforms are actually logged in,
 * based on the presence of their auth marker cookie. Drives the per-platform
 * status cards in Settings → Browser Login so an unauthenticated platform isn't
 * shown as "active".
 */
export function getAuthenticatedPlatforms(): Record<AuthPlatformKey, boolean> {
  const result: Record<AuthPlatformKey, boolean> = { facebook: false, linkedin: false, x: false };
  try {
    const raw = readStorageStateRaw();
    if (!raw) return result;
    const cookies = (JSON.parse(raw)?.cookies ?? []) as StoredCookie[];
    for (const key of Object.keys(AUTH_COOKIE_MARKERS) as AuthPlatformKey[]) {
      result[key] = AUTH_COOKIE_MARKERS[key].some((m) =>
        cookies.some(
          // Match on the platform-specific cookie name + a value. Enforce the
          // domain only when present: minimally-seeded sessions can carry the
          // marker cookie without a domain field, and they're still valid logins.
          (c) => c.name === m.name && !!c.value && (!c.domain || c.domain.includes(m.domain))
        )
      );
    }
  } catch {
    // malformed/unreadable session → treat as not authenticated
  }
  return result;
}

/**
 * Get storageState for use with browser.newContext().
 *
 * The on-disk storage-state.json file is the single source of truth. It is the
 * "rolling session": every authenticated scrape re-exports the (rotated, freshly
 * extended) cookies back to it via {@link saveStorageState}, so the session stays
 * alive indefinitely as long as the scraper keeps running — no re-login needed.
 *
 * The BROWSER_STORAGE_STATE env var (Render / production) is only a BOOTSTRAP
 * seed: it is written to the file once, on first use, and from then on the
 * refreshed file takes priority. (On a fresh deploy the ephemeral file is gone,
 * so the env var seeds it again — and if the env var is ever stale, re-pasting a
 * fresh value + restart re-seeds cleanly.)
 */
export function getStorageState(): string | undefined {
  // Rolling session file — the freshest cookies live here once it exists.
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    return STORAGE_STATE_PATH;
  }
  // Bootstrap: seed the rolling file from the env var (first run / fresh deploy).
  if (process.env.BROWSER_STORAGE_STATE) {
    fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    fs.writeFileSync(STORAGE_STATE_PATH, process.env.BROWSER_STORAGE_STATE, "utf-8");
    return STORAGE_STATE_PATH;
  }
  return undefined;
}

/**
 * Persist the current browser cookies/localStorage back to the rolling session
 * file. Call this after a scrape where we CONFIRMED the session is still logged
 * in — it captures the cookies Facebook/LinkedIn just rotated and re-extended,
 * which is what keeps the login from expiring over time.
 *
 * Never call this on a logged-out context: it would overwrite good saved cookies
 * with an empty session.
 */
export async function saveStorageState(
  context: import("playwright").BrowserContext
): Promise<void> {
  try {
    fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log(`[auth] Rolling session refreshed → cookies re-saved (no expiry while scraping runs)`);
    // Also persist to Supabase so the refreshed cookies survive a redeploy.
    await saveSessionToSupabase();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[auth] Could not refresh rolling session: ${msg}`);
  }
}

/**
 * Load the durable session from Supabase into the local rolling file.
 * Returns true if a session was found and written. This is the source of truth
 * that survives container redeploys (where the local file is wiped).
 */
export async function loadSessionFromSupabase(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb
      .from(SESSION_TABLE)
      .select("storage_state")
      .eq("id", SESSION_ROW_ID)
      .maybeSingle();
    if (error || !data?.storage_state) return false;
    const json =
      typeof data.storage_state === "string"
        ? data.storage_state
        : JSON.stringify(data.storage_state);
    fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    fs.writeFileSync(STORAGE_STATE_PATH, json, "utf-8");
    console.log("[auth] Session loaded from Supabase → rolling file");
    return true;
  } catch (err) {
    console.warn(`[auth] loadSessionFromSupabase failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Persist the current rolling session to Supabase so it survives redeploys.
 * Called after every successful scrape (via saveStorageState) and after a Live
 * Login save, so the freshest cookies are always durably stored.
 */
export async function saveSessionToSupabase(rawJson?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const payload =
      rawJson ?? (fs.existsSync(STORAGE_STATE_PATH) ? fs.readFileSync(STORAGE_STATE_PATH, "utf-8") : null);
    if (!payload) return;
    await sb
      .from(SESSION_TABLE)
      .upsert(
        { id: SESSION_ROW_ID, storage_state: JSON.parse(payload), updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    console.log("[auth] Session persisted to Supabase");
  } catch (err) {
    console.warn(`[auth] saveSessionToSupabase failed: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Startup: make the rolling session durable.
 *
 * Priority order:
 *   1. Supabase row — auto-refreshed and survives redeploys (the steady state).
 *   2. BROWSER_STORAGE_STATE env — one-time bootstrap; once present it is migrated
 *      into Supabase so future boots use the durable copy and you never re-paste.
 */
export async function initSession(): Promise<void> {
  if (await loadSessionFromSupabase()) return;
  if (process.env.BROWSER_STORAGE_STATE) {
    fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    fs.writeFileSync(STORAGE_STATE_PATH, process.env.BROWSER_STORAGE_STATE, "utf-8");
    console.log("[auth] Seeded session from BROWSER_STORAGE_STATE env → migrating to Supabase");
    await saveSessionToSupabase(process.env.BROWSER_STORAGE_STATE);
  }
}

/**
 * Check if we should use storageState (server mode) vs persistent profile (local mode).
 * On Render, there's no persistent profile dir, so we always use storageState.
 */
export function shouldUseStorageState(): boolean {
  if (process.env.BROWSER_STORAGE_STATE) return true;
  if (fs.existsSync(STORAGE_STATE_PATH)) return true;
  return false;
}

const PLATFORMS: Record<string, { name: string; loginUrl: string }> = {
  facebook: { name: "Facebook", loginUrl: "https://www.facebook.com" },
  linkedin: { name: "LinkedIn", loginUrl: "https://www.linkedin.com/login" },
  twitter: { name: "X / Twitter", loginUrl: "https://x.com/i/flow/login" },
};

/**
 * Open a visible browser with a persistent profile so the user can log in.
 * After login, exports a portable storage-state.json for server deployment.
 *
 * Usage:
 *   npm run auth:login              → opens all platforms in tabs
 *   npm run auth:login -- linkedin  → opens only LinkedIn
 *   npm run auth:login -- facebook  → opens only Facebook
 *   npm run auth:login -- twitter   → opens only Twitter
 */
export async function loginAndSave(platform?: string): Promise<void> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const targets =
    platform && platform !== "all"
      ? { [platform]: PLATFORMS[platform] }
      : PLATFORMS;

  if (platform && platform !== "all" && !PLATFORMS[platform]) {
    console.error(
      `Unknown platform "${platform}". Available: ${Object.keys(PLATFORMS).join(", ")}, all`
    );
    process.exit(1);
  }

  const targetNames = Object.values(targets).map((t) => t.name).join(", ");

  console.log("\n===================================================");
  console.log("  Browser Login — Persistent Profile");
  console.log("===================================================");
  console.log(`Opening: ${targetNames}`);
  console.log(`\nYour login session is saved AUTOMATICALLY to:`);
  console.log(`  ${PROFILE_DIR}`);
  console.log("\nClose the browser when done.\n");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  // Open each platform in its own tab
  const entries = Object.values(targets);
  for (let i = 0; i < entries.length; i++) {
    const page =
      i === 0
        ? context.pages()[0] || (await context.newPage())
        : await context.newPage();
    await page.goto(entries[i].loginUrl);
    console.log(`[auth] Opened ${entries[i].name} → ${entries[i].loginUrl}`);
  }

  console.log("\n[auth] Log in to your accounts, then close the browser.\n");

  // Wait for the browser to be closed by the user
  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });

  // Export portable storage state (cookies + localStorage as JSON)
  // This must be done BEFORE close — re-open briefly to export
  const exportContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  await exportContext.storageState({ path: STORAGE_STATE_PATH });
  await exportContext.close();

  console.log("[auth] Browser closed — session saved!");
  console.log(`[auth] Profile dir:    ${PROFILE_DIR}`);
  console.log(`[auth] Storage state:  ${STORAGE_STATE_PATH}`);

  // Verify
  const files = fs.readdirSync(PROFILE_DIR);
  console.log(`[auth] Profile files: ${files.length}`);

  console.log("\n===================================================");
  console.log("  FOR RENDER DEPLOYMENT:");
  console.log("===================================================");
  console.log("Copy the contents of the storage-state.json file into");
  console.log("a Render environment variable called BROWSER_STORAGE_STATE.");
  console.log("");
  console.log("Quick copy command:");
  console.log(`  cat "${STORAGE_STATE_PATH}"`);
  console.log("===================================================\n");
}

// ---------------------------------------------------------------------------
// Cookie validation — lightweight check to detect expired sessions
// ---------------------------------------------------------------------------

/** Test URLs that require login. If we land on a login page, cookies are stale. */
const VALIDATION_TARGETS: Record<string, { url: string; loginIndicators: RegExp[] }> = {
  facebook: {
    url: "https://www.facebook.com/me",
    // If redirected to login page or see login form, cookies are expired
    loginIndicators: [
      /\/login/i,
      /\/checkpoint/i,
      /id="loginform"/i,
      /id="email"/i,
    ],
  },
  linkedin: {
    url: "https://www.linkedin.com/feed/",
    loginIndicators: [
      /\/login/i,
      /\/uas\/login/i,
      /\/authwall/i,
      /class="sign-in-form"/i,
    ],
  },
};

export type CookieValidationResult = "valid" | "expired" | "no_cookies" | "error";

/**
 * Validate cookies for a specific platform by loading a page that requires auth
 * and checking if we get redirected to a login page.
 *
 * Returns: "valid" | "expired" | "no_cookies" | "error"
 */
export async function validateCookies(
  platform: "facebook" | "linkedin"
): Promise<CookieValidationResult> {
  const target = VALIDATION_TARGETS[platform];
  if (!target) return "error";

  // Check if we even have cookies to validate
  if (!hasSavedCookies()) return "no_cookies";

  const storageState = getStorageState();
  if (!storageState) return "no_cookies";

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext({
      storageState,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    try {
      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch {
      // Timeout or navigation error — could be network issue, not auth
      await context.close();
      return "error";
    }

    const finalUrl = page.url();
    const bodyHtml = await page.content().catch(() => "");

    await context.close();

    // Check if the final URL or page content indicates a login wall
    for (const indicator of target.loginIndicators) {
      if (indicator.test(finalUrl) || indicator.test(bodyHtml)) {
        console.log(
          `[auth] ${platform} cookie validation: EXPIRED (matched: ${indicator.source})`
        );
        return "expired";
      }
    }

    console.log(`[auth] ${platform} cookie validation: VALID`);
    return "valid";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auth] ${platform} cookie validation error: ${msg}`);
    return "error";
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Validate cookies for all auth-requiring platforms.
 * Returns a map of platform → validation result.
 */
export async function validateAllCookies(): Promise<
  Record<string, CookieValidationResult>
> {
  const results: Record<string, CookieValidationResult> = {};

  for (const platform of Object.keys(VALIDATION_TARGETS) as Array<
    "facebook" | "linkedin"
  >) {
    results[platform] = await validateCookies(platform);
    // Small delay between checks to avoid looking like a bot
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// Allow running directly: npm run auth:login -- linkedin
if (require.main === module) {
  const platform = process.argv[2]?.toLowerCase();
  loginAndSave(platform)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
