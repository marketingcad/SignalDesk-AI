"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSavedCookies = hasSavedCookies;
exports.getProfileDir = getProfileDir;
exports.getStorageState = getStorageState;
exports.shouldUseStorageState = shouldUseStorageState;
exports.loginAndSave = loginAndSave;
const playwright_1 = require("playwright");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Persistent browser profile directory (local dev).
 */
const PROFILE_DIR = path_1.default.resolve(__dirname, "../../auth/browser-profile");
/**
 * Exported storageState JSON file (portable — works on Render).
 */
const STORAGE_STATE_PATH = path_1.default.resolve(__dirname, "../../auth/storage-state.json");
/**
 * Check if auth is available — either local profile, storage-state file, or env var.
 */
function hasSavedCookies() {
    if (process.env.BROWSER_STORAGE_STATE)
        return true;
    if (fs_1.default.existsSync(STORAGE_STATE_PATH))
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
 * Priority: env var > storage-state.json file > undefined (no auth).
 */
function getStorageState() {
    // 1. Env var (for Render / production)
    if (process.env.BROWSER_STORAGE_STATE) {
        const tmpPath = path_1.default.resolve(__dirname, "../../auth/.tmp-storage-state.json");
        fs_1.default.mkdirSync(path_1.default.dirname(tmpPath), { recursive: true });
        fs_1.default.writeFileSync(tmpPath, process.env.BROWSER_STORAGE_STATE, "utf-8");
        return tmpPath;
    }
    // 2. Exported file (from local login)
    if (fs_1.default.existsSync(STORAGE_STATE_PATH)) {
        return STORAGE_STATE_PATH;
    }
    return undefined;
}
/**
 * Check if we should use storageState (server mode) vs persistent profile (local mode).
 * On Render, there's no persistent profile dir, so we always use storageState.
 */
function shouldUseStorageState() {
    if (process.env.BROWSER_STORAGE_STATE)
        return true;
    if (fs_1.default.existsSync(STORAGE_STATE_PATH))
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
    await exportContext.storageState({ path: STORAGE_STATE_PATH });
    await exportContext.close();
    console.log("[auth] Browser closed — session saved!");
    console.log(`[auth] Profile dir:    ${PROFILE_DIR}`);
    console.log(`[auth] Storage state:  ${STORAGE_STATE_PATH}`);
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
    console.log(`  cat "${STORAGE_STATE_PATH}"`);
    console.log("===================================================\n");
}
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