"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_STATE_PATH = void 0;
exports.hasSavedCookies = hasSavedCookies;
exports.getProfileDir = getProfileDir;
exports.getStorageState = getStorageState;
exports.saveStorageState = saveStorageState;
exports.shouldUseStorageState = shouldUseStorageState;
exports.loginAndSave = loginAndSave;
exports.validateCookies = validateCookies;
exports.validateAllCookies = validateAllCookies;
const playwright_1 = require("playwright");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Persistent browser profile directory (local dev).
 */
const PROFILE_DIR = path_1.default.resolve(__dirname, "../../auth/browser-profile");
/**
 * Exported storageState JSON file (portable — works on Render).
 * Exported so the Live Login engine writes the session to the same file the
 * scrapers read from via {@link getStorageState}.
 */
exports.STORAGE_STATE_PATH = path_1.default.resolve(__dirname, "../../auth/storage-state.json");
/**
 * Check if auth is available — either local profile, storage-state file, or env var.
 */
function hasSavedCookies() {
    if (process.env.BROWSER_STORAGE_STATE)
        return true;
    if (fs_1.default.existsSync(exports.STORAGE_STATE_PATH))
        return true;
    return fs_1.default.existsSync(PROFILE_DIR) && fs_1.default.readdirSync(PROFILE_DIR).length > 0;
}
/**
 * Get the path to the persistent browser profile directory.
 */
function getProfileDir() {
    return PROFILE_DIR;
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
function getStorageState() {
    // Rolling session file — the freshest cookies live here once it exists.
    if (fs_1.default.existsSync(exports.STORAGE_STATE_PATH)) {
        return exports.STORAGE_STATE_PATH;
    }
    // Bootstrap: seed the rolling file from the env var (first run / fresh deploy).
    if (process.env.BROWSER_STORAGE_STATE) {
        fs_1.default.mkdirSync(path_1.default.dirname(exports.STORAGE_STATE_PATH), { recursive: true });
        fs_1.default.writeFileSync(exports.STORAGE_STATE_PATH, process.env.BROWSER_STORAGE_STATE, "utf-8");
        return exports.STORAGE_STATE_PATH;
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
async function saveStorageState(context) {
    try {
        fs_1.default.mkdirSync(path_1.default.dirname(exports.STORAGE_STATE_PATH), { recursive: true });
        await context.storageState({ path: exports.STORAGE_STATE_PATH });
        console.log(`[auth] Rolling session refreshed → cookies re-saved (no expiry while scraping runs)`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[auth] Could not refresh rolling session: ${msg}`);
    }
}
/**
 * Check if we should use storageState (server mode) vs persistent profile (local mode).
 * On Render, there's no persistent profile dir, so we always use storageState.
 */
function shouldUseStorageState() {
    if (process.env.BROWSER_STORAGE_STATE)
        return true;
    if (fs_1.default.existsSync(exports.STORAGE_STATE_PATH))
        return true;
    return false;
}
const PLATFORMS = {
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
async function loginAndSave(platform) {
    fs_1.default.mkdirSync(PROFILE_DIR, { recursive: true });
    const targets = platform && platform !== "all"
        ? { [platform]: PLATFORMS[platform] }
        : PLATFORMS;
    if (platform && platform !== "all" && !PLATFORMS[platform]) {
        console.error(`Unknown platform "${platform}". Available: ${Object.keys(PLATFORMS).join(", ")}, all`);
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
    const context = await playwright_1.chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"],
        viewport: { width: 1280, height: 800 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    // Open each platform in its own tab
    const entries = Object.values(targets);
    for (let i = 0; i < entries.length; i++) {
        const page = i === 0
            ? context.pages()[0] || (await context.newPage())
            : await context.newPage();
        await page.goto(entries[i].loginUrl);
        console.log(`[auth] Opened ${entries[i].name} → ${entries[i].loginUrl}`);
    }
    console.log("\n[auth] Log in to your accounts, then close the browser.\n");
    // Wait for the browser to be closed by the user
    await new Promise((resolve) => {
        context.on("close", () => resolve());
    });
    // Export portable storage state (cookies + localStorage as JSON)
    // This must be done BEFORE close — re-open briefly to export
    const exportContext = await playwright_1.chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
    });
    await exportContext.storageState({ path: exports.STORAGE_STATE_PATH });
    await exportContext.close();
    console.log("[auth] Browser closed — session saved!");
    console.log(`[auth] Profile dir:    ${PROFILE_DIR}`);
    console.log(`[auth] Storage state:  ${exports.STORAGE_STATE_PATH}`);
    // Verify
    const files = fs_1.default.readdirSync(PROFILE_DIR);
    console.log(`[auth] Profile files: ${files.length}`);
    console.log("\n===================================================");
    console.log("  FOR RENDER DEPLOYMENT:");
    console.log("===================================================");
    console.log("Copy the contents of the storage-state.json file into");
    console.log("a Render environment variable called BROWSER_STORAGE_STATE.");
    console.log("");
    console.log("Quick copy command:");
    console.log(`  cat "${exports.STORAGE_STATE_PATH}"`);
    console.log("===================================================\n");
}
// ---------------------------------------------------------------------------
// Cookie validation — lightweight check to detect expired sessions
// ---------------------------------------------------------------------------
/** Test URLs that require login. If we land on a login page, cookies are stale. */
const VALIDATION_TARGETS = {
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
/**
 * Validate cookies for a specific platform by loading a page that requires auth
 * and checking if we get redirected to a login page.
 *
 * Returns: "valid" | "expired" | "no_cookies" | "error"
 */
async function validateCookies(platform) {
    const target = VALIDATION_TARGETS[platform];
    if (!target)
        return "error";
    // Check if we even have cookies to validate
    if (!hasSavedCookies())
        return "no_cookies";
    const storageState = getStorageState();
    if (!storageState)
        return "no_cookies";
    let browser;
    try {
        browser = await playwright_1.chromium.launch({
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
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        try {
            await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 20000 });
        }
        catch {
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
                console.log(`[auth] ${platform} cookie validation: EXPIRED (matched: ${indicator.source})`);
                return "expired";
            }
        }
        console.log(`[auth] ${platform} cookie validation: VALID`);
        return "valid";
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[auth] ${platform} cookie validation error: ${msg}`);
        return "error";
    }
    finally {
        if (browser)
            await browser.close().catch(() => { });
    }
}
/**
 * Validate cookies for all auth-requiring platforms.
 * Returns a map of platform → validation result.
 */
async function validateAllCookies() {
    const results = {};
    for (const platform of Object.keys(VALIDATION_TARGETS)) {
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
//# sourceMappingURL=browserAuth.js.map