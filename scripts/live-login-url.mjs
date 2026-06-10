#!/usr/bin/env node
/**
 * Mint a fresh Live Login viewer URL on demand — a manual fallback for when the
 * dashboard "Live Login (Cloud)" button fails. It cancels any stuck session,
 * starts a new one on the cloud scraper, and prints the viewer URL to open.
 *
 * Usage:
 *   node scripts/live-login-url.mjs                 # facebook, prod scraper
 *   node scripts/live-login-url.mjs linkedin        # other platform
 *   node scripts/live-login-url.mjs facebook https://my-scraper.ondigitalocean.app
 *
 * Reads BACKEND_AUTH_TOKEN from .env. The URL is valid ~15 minutes.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const platform = (process.argv[2] || "facebook").toLowerCase();
const baseArg = process.argv[3];

// --- read .env (token + default scraper url) ---
function envValue(key) {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    if (t.slice(0, i).trim() === key) return t.slice(i + 1).trim();
  }
  return undefined;
}

const TOKEN = process.env.BACKEND_AUTH_TOKEN || envValue("BACKEND_AUTH_TOKEN");
// Default to the deployed scraper; override with the 2nd arg or a public env URL.
const BASE =
  baseArg ||
  process.env.SCRAPER_PUBLIC_URL ||
  "https://signaldesk-scraper-dj3eb.ondigitalocean.app";

if (!TOKEN) {
  console.error("✗ BACKEND_AUTH_TOKEN not found in .env");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: auth,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(75_000),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

try {
  // 1) Health check so failures are clear, not cryptic
  const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json())
    .catch(() => null);
  if (!health) {
    console.error(`✗ Scraper not reachable at ${BASE} (is it deployed / awake?)`);
    process.exit(1);
  }

  // 2) Clear any stuck session, then start fresh
  await post("/api/auth/live/cancel");
  console.log("Starting login browser (may take up to ~30s on a cold start)…");
  const { status, data } = await post("/api/auth/live/start", { platform });

  if (status !== 200 || !data?.viewerPath) {
    console.error(`✗ start failed [${status}]: ${data?.error || JSON.stringify(data)}`);
    process.exit(1);
  }

  const mins = Math.max(0, Math.round((data.expiresAt - Date.now()) / 60000));
  console.log(`\n✓ Live Login ready for ${platform} (valid ~${mins} min). Open this URL:\n`);
  console.log(`${BASE}${data.viewerPath}\n`);
  console.log("Log in there → then click \"Save Session\" in Settings (or it auto-clears in 15 min).");
} catch (err) {
  const name = err?.name === "TimeoutError" ? "timed out" : err?.message || String(err);
  console.error(`✗ Could not start Live Login: ${name}`);
  process.exit(1);
}
