import { chromium } from "playwright";
import fs from "fs";
import path from "path";

/**
 * Persistent browser profile directory.
 * Playwright stores cookies, localStorage, sessions etc. here automatically —
 * just like a normal Chrome profile. No manual cookie export needed.
 */
const PROFILE_DIR = path.resolve(__dirname, "../../auth/browser-profile");

/**
 * Check if a logged-in browser profile exists.
 */
export function hasSavedCookies(): boolean {
  return fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0;
}

/**
 * Get the path to the persistent browser profile directory.
 */
export function getProfileDir(): string {
  return PROFILE_DIR;
}

/**
 * Open a visible browser with a persistent profile so the user can log in.
 * The login session is saved automatically to the profile directory —
 * cookies persist even after the browser is closed, just like normal Chrome.
 *
 * Usage: npm run auth:login
 */
export async function loginAndSave(): Promise<void> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

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
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  // Open Facebook login
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.facebook.com");

  console.log("[auth] Browser opened — log in to your accounts...");
  console.log("[auth] Close the browser window when done.\n");

  // Wait for the browser to be closed by the user
  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });

  console.log("[auth] Browser closed — session saved!");
  console.log(`[auth] Profile dir: ${PROFILE_DIR}`);

  // Verify cookies were saved
  const files = fs.readdirSync(PROFILE_DIR);
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
