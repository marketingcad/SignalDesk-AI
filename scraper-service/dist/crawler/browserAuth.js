"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSavedCookies = hasSavedCookies;
exports.getProfileDir = getProfileDir;
exports.loginAndSave = loginAndSave;
const playwright_1 = require("playwright");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Persistent browser profile directory.
 * Playwright stores cookies, localStorage, sessions etc. here automatically —
 * just like a normal Chrome profile. No manual cookie export needed.
 */
const PROFILE_DIR = path_1.default.resolve(__dirname, "../../auth/browser-profile");
/**
 * Check if a logged-in browser profile exists.
 */
function hasSavedCookies() {
    return fs_1.default.existsSync(PROFILE_DIR) && fs_1.default.readdirSync(PROFILE_DIR).length > 0;
}
/**
 * Get the path to the persistent browser profile directory.
 */
function getProfileDir() {
    return PROFILE_DIR;
}
/**
 * Open a visible browser with a persistent profile so the user can log in.
 * The login session is saved automatically to the profile directory —
 * cookies persist even after the browser is closed, just like normal Chrome.
 *
 * Usage: npm run auth:login
 */
async function loginAndSave() {
    fs_1.default.mkdirSync(PROFILE_DIR, { recursive: true });
    console.log("\n===================================================");
    console.log("  Browser Login — Persistent Profile");
    console.log("===================================================");
    console.log("A browser window will open with a persistent profile.");
    console.log("Log in to:");
    console.log("  1. Facebook (facebook.com)");
    console.log("  2. LinkedIn (linkedin.com)  [optional]");
    console.log("  3. X/Twitter (x.com)        [optional]");
    console.log("\nYour login session is saved AUTOMATICALLY to:");
    console.log(`  ${PROFILE_DIR}`);
    console.log("\nClose the browser when done.\n");
    // launchPersistentContext stores all cookies/session data in the profile dir
    const context = await playwright_1.chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"],
        viewport: { width: 1280, height: 800 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    // Open Facebook login
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://www.facebook.com");
    console.log("[auth] Browser opened — log in to your accounts...");
    console.log("[auth] Close the browser window when done.\n");
    // Wait for the browser to be closed by the user
    await new Promise((resolve) => {
        context.on("close", () => resolve());
    });
    console.log("[auth] Browser closed — session saved!");
    console.log(`[auth] Profile dir: ${PROFILE_DIR}`);
    // Verify cookies were saved
    const files = fs_1.default.readdirSync(PROFILE_DIR);
    console.log(`[auth] Profile files: ${files.length}`);
    console.log("[auth] Next time you scrape a URL, it will use this logged-in session.\n");
}
// Allow running directly: npm run auth:login
if (require.main === module) {
    loginAndSave()
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=browserAuth.js.map