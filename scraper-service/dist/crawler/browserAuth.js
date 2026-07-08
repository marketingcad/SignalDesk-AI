"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_STATE_PATH = void 0;
exports.hasSavedCookies = hasSavedCookies;
exports.getProfileDir = getProfileDir;
exports.getAuthenticatedPlatforms = getAuthenticatedPlatforms;
exports.getStorageStateForContext = getStorageStateForContext;
exports.getStorageState = getStorageState;
exports.saveStorageState = saveStorageState;
exports.loadSessionFromSupabase = loadSessionFromSupabase;
exports.saveSessionToSupabase = saveSessionToSupabase;
exports.initSession = initSession;
exports.shouldUseStorageState = shouldUseStorageState;
exports.loginAndSave = loginAndSave;
exports.validateCookies = validateCookies;
exports.validateAllCookies = validateAllCookies;
const playwright_1 = require("playwright");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const supabase_1 = require("../db/supabase");
/** Durable session storage: one row in Supabase that survives redeploys. */
const SESSION_TABLE = "scraper_sessions";
const SESSION_ROW_ID = "default";
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
 * Marker cookies that are only present (with a value) when the account is
 * actually logged in. This is the source of truth for "is THIS platform
 * authenticated", as opposed to the global hasSavedCookies()/health status —
 * the rolling session file holds cookies for several domains at once, so one
 * platform being logged in does not mean the others are.
 */
const AUTH_COOKIE_MARKERS = {
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
/** Read the raw rolling session JSON (file first, env bootstrap fallback). */
function readStorageStateRaw() {
    if (fs_1.default.existsSync(exports.STORAGE_STATE_PATH))
        return fs_1.default.readFileSync(exports.STORAGE_STATE_PATH, "utf-8");
    if (process.env.BROWSER_STORAGE_STATE)
        return process.env.BROWSER_STORAGE_STATE;
    return undefined;
}
/**
 * Inspect the saved session and report which platforms are actually logged in,
 * based on the presence of their auth marker cookie. Drives the per-platform
 * status cards in Settings → Browser Login so an unauthenticated platform isn't
 * shown as "active".
 */
function getAuthenticatedPlatforms() {
    const result = { facebook: false, linkedin: false, x: false };
    try {
        const raw = readStorageStateRaw();
        if (!raw)
            return result;
        const cookies = (JSON.parse(raw)?.cookies ?? []);
        for (const key of Object.keys(AUTH_COOKIE_MARKERS)) {
            result[key] = AUTH_COOKIE_MARKERS[key].some((m) => cookies.some(
            // A usable login cookie must have a value AND a matching domain.
            // A domain-less marker cookie (e.g. a minimally-seeded `xs`) cannot be
            // loaded into a browser context, so it is NOT a real session — don't
            // report it as authenticated (it would show green while scrapes fail).
            (c) => c.name === m.name &&
                !!c.value &&
                typeof c.domain === "string" &&
                c.domain.includes(m.domain)));
        }
    }
    catch {
        // malformed/unreadable session → treat as not authenticated
    }
    return result;
}
/**
 * Build a storageState OBJECT safe to pass to browser.newContext().
 *
 * Playwright rejects the entire context if ANY cookie lacks a `url` or a
 * `domain`+`path` pair ("Cookie should have a url or a domain/path pair"),
 * which crashes the scrape outright. A minimally-seeded session can contain
 * exactly such a cookie (a bare `xs`). Drop those unusable cookies and
 * normalise the rest so the context always builds — logged-out at worst, never
 * a crash. Returns undefined when there is no session data at all.
 */
function getStorageStateForContext() {
    const raw = readStorageStateRaw();
    if (!raw)
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return undefined;
    }
    const validSameSite = new Set(["Strict", "Lax", "None"]);
    const cookies = (parsed.cookies ?? [])
        // storageState cookies must carry a domain — drop any that don't.
        .filter((c) => c && typeof c.name === "string" && typeof c.domain === "string" && c.domain)
        .map((c) => ({
        name: c.name,
        value: String(c.value ?? ""),
        domain: c.domain,
        path: c.path || "/",
        expires: typeof c.expires === "number" ? c.expires : -1,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: validSameSite.has(c.sameSite) ? c.sameSite : "Lax",
    }));
    return { cookies, origins: Array.isArray(parsed.origins) ? parsed.origins : [] };
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
        // Also persist to Supabase so the refreshed cookies survive a redeploy.
        await saveSessionToSupabase();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[auth] Could not refresh rolling session: ${msg}`);
    }
}
/**
 * Load the durable session from Supabase into the local rolling file.
 * Returns true if a session was found and written. This is the source of truth
 * that survives container redeploys (where the local file is wiped).
 */
async function loadSessionFromSupabase() {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb)
        return false;
    try {
        const { data, error } = await sb
            .from(SESSION_TABLE)
            .select("storage_state")
            .eq("id", SESSION_ROW_ID)
            .maybeSingle();
        if (error || !data?.storage_state)
            return false;
        const json = typeof data.storage_state === "string"
            ? data.storage_state
            : JSON.stringify(data.storage_state);
        fs_1.default.mkdirSync(path_1.default.dirname(exports.STORAGE_STATE_PATH), { recursive: true });
        fs_1.default.writeFileSync(exports.STORAGE_STATE_PATH, json, "utf-8");
        console.log("[auth] Session loaded from Supabase → rolling file");
        return true;
    }
    catch (err) {
        console.warn(`[auth] loadSessionFromSupabase failed: ${err instanceof Error ? err.message : err}`);
        return false;
    }
}
/**
 * Persist the current rolling session to Supabase so it survives redeploys.
 * Called after every successful scrape (via saveStorageState) and after a Live
 * Login save, so the freshest cookies are always durably stored.
 */
async function saveSessionToSupabase(rawJson) {
    const sb = (0, supabase_1.getSupabase)();
    if (!sb)
        return;
    try {
        const payload = rawJson ?? (fs_1.default.existsSync(exports.STORAGE_STATE_PATH) ? fs_1.default.readFileSync(exports.STORAGE_STATE_PATH, "utf-8") : null);
        if (!payload)
            return;
        await sb
            .from(SESSION_TABLE)
            .upsert({ id: SESSION_ROW_ID, storage_state: JSON.parse(payload), updated_at: new Date().toISOString() }, { onConflict: "id" });
        console.log("[auth] Session persisted to Supabase");
    }
    catch (err) {
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
async function initSession() {
    const loaded = await loadSessionFromSupabase();
    // A loaded Supabase row can be DEGRADED — e.g. a partial save that dropped the
    // real login cookies, leaving only a domain-less `xs`. If it carries no usable
    // login for ANY platform, don't get stuck logged-out: fall back to the
    // BROWSER_STORAGE_STATE bootstrap (which may still hold a full session) and
    // re-persist it, so a bad row can't permanently shadow a good seed.
    if (loaded && Object.values(getAuthenticatedPlatforms()).some(Boolean))
        return;
    if (process.env.BROWSER_STORAGE_STATE) {
        fs_1.default.mkdirSync(path_1.default.dirname(exports.STORAGE_STATE_PATH), { recursive: true });
        fs_1.default.writeFileSync(exports.STORAGE_STATE_PATH, process.env.BROWSER_STORAGE_STATE, "utf-8");
        console.log(loaded
            ? "[auth] Supabase session had no usable login — re-seeding from BROWSER_STORAGE_STATE env"
            : "[auth] Seeded session from BROWSER_STORAGE_STATE env → migrating to Supabase");
        await saveSessionToSupabase(process.env.BROWSER_STORAGE_STATE);
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
        ],
    },
    linkedin: {
        url: "https://www.linkedin.com/feed/",
        loginIndicators: [
            /\/login/i,
            /\/uas\/login/i,
            /\/authwall/i,
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
    // Use the sanitised object so a malformed cookie can't crash newContext.
    // If sanitising leaves no usable cookies, there's effectively no session.
    const storageState = getStorageStateForContext();
    if (!storageState || storageState.cookies.length === 0)
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
        await context.close();
        // Trust ONLY the final redirect URL: a logged-out session bounces /me (or
        // /feed) to a /login or /checkpoint URL. The page HTML of a logged-IN profile
        // still contains strings like "/login" or id="email" (hidden forms), which
        // produced false "expired" results — so we no longer scan the body.
        for (const indicator of target.loginIndicators) {
            if (indicator.test(finalUrl)) {
                console.log(`[auth] ${platform} cookie validation: EXPIRED (redirected to ${finalUrl})`);
                return "expired";
            }
        }
        console.log(`[auth] ${platform} cookie validation: VALID (${finalUrl})`);
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