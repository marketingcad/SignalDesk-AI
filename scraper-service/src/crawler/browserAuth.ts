import { chromium } from "playwright";
import fs from "fs";
import path from "path";

/**
 * Persistent browser profile directory (local dev).
 */
const PROFILE_DIR = path.resolve(__dirname, "../../auth/browser-profile");

/**
 * Exported storageState JSON file (portable — works on Render).
 */
const STORAGE_STATE_PATH = path.resolve(__dirname, "../../auth/storage-state.json");

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

/**
 * Get storageState for use with browser.newContext().
 * Priority: env var > storage-state.json file > undefined (no auth).
 */
export function getStorageState(): string | undefined {
  // 1. Env var (for Render / production)
  if (process.env.BROWSER_STORAGE_STATE) {
    const tmpPath = path.resolve(__dirname, "../../auth/.tmp-storage-state.json");
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, process.env.BROWSER_STORAGE_STATE, "utf-8");
    return tmpPath;
  }
  // 2. Exported file (from local login)
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    return STORAGE_STATE_PATH;
  }
  return undefined;
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
