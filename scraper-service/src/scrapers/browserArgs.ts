// Memory-optimized Chromium flags for low-RAM environments (Render free = 512MB)
export const BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-setuid-sandbox",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--no-first-run",
  "--single-process",
  "--js-flags=--max-old-space-size=256",
];
