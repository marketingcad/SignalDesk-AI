#!/usr/bin/env node
/**
 * Credential checker for SignalDesk AI.
 *
 * Verifies that required environment variables are (a) present and
 * (b) actually valid by making live calls to Supabase, Google AI, and
 * the scraper service.
 *
 * Usage:
 *   node scripts/check-credentials.mjs            # checks .env in repo root
 *   node scripts/check-credentials.mjs .env.local # checks a specific file
 *   node scripts/check-credentials.mjs --live      # also run live API tests
 *
 * Exit code 0 = all required vars OK, 1 = something required is missing/invalid.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const runLive = args.includes("--live");
const envFile = args.find((a) => !a.startsWith("--")) || ".env";

// ---- tiny .env parser (no deps) -------------------------------------------
function loadEnv(file) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) {
    console.error(`\x1b[31m✗ Env file not found: ${path}\x1b[0m`);
    process.exit(1);
  }
  const env = {};
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  // merge real process.env so it also works when run with --env-file or on a host
  return { ...env, ...process.env };
}

const env = loadEnv(envFile);

// ---- what the code actually requires --------------------------------------
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "GOOGLE_AI_API_KEY",
  "SCRAPER_SERVICE_URL",
];
const OPTIONAL = [
  "DISCORD_WEBHOOK_URL",
  "FB_VERIFY_TOKEN",
  "FB_APP_SECRET",
  "BACKEND_AUTH_TOKEN",
  "BROWSER_STORAGE_STATE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const mask = (v) => (v.length <= 8 ? "••••" : v.slice(0, 4) + "…" + v.slice(-4));

let failed = false;

// ---- 1. presence check -----------------------------------------------------
console.log(`\nChecking \x1b[1m${envFile}\x1b[0m\n`);
console.log("Required:");
for (const k of REQUIRED) {
  const v = env[k];
  if (v && v.trim() && !/your_.*_here/.test(v)) {
    console.log(`  ${g("✓")} ${k.padEnd(30)} ${dim(mask(v))}`);
  } else {
    console.log(`  ${r("✗")} ${k.padEnd(30)} ${r("MISSING or placeholder")}`);
    failed = true;
  }
}
console.log("\nOptional:");
for (const k of OPTIONAL) {
  const v = env[k];
  if (v && v.trim()) console.log(`  ${g("✓")} ${k.padEnd(30)} ${dim(mask(v))}`);
  else console.log(`  ${y("–")} ${k.padEnd(30)} ${dim("not set")}`);
}

// ---- 2. live API tests -----------------------------------------------------
if (runLive && !failed) {
  console.log(`\n${dim("Running live tests…")}\n`);

  // Supabase service-role key
  try {
    const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (res.ok || res.status === 404)
      console.log(`  ${g("✓")} Supabase service-role key works (${res.status})`);
    else {
      console.log(`  ${r("✗")} Supabase rejected the key (${res.status})`);
      failed = true;
    }
  } catch (e) {
    console.log(`  ${r("✗")} Supabase unreachable: ${e.message}`);
    failed = true;
  }

  // Google AI key
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GOOGLE_AI_API_KEY}`,
    );
    if (res.ok) console.log(`  ${g("✓")} Google AI key valid`);
    else {
      console.log(`  ${r("✗")} Google AI key invalid (${res.status})`);
      failed = true;
    }
  } catch (e) {
    console.log(`  ${r("✗")} Google AI unreachable: ${e.message}`);
    failed = true;
  }

  // Scraper service reachability (non-fatal — may be internal-only)
  try {
    const res = await fetch(env.SCRAPER_SERVICE_URL, { signal: AbortSignal.timeout(8000) });
    console.log(`  ${g("✓")} Scraper reachable at ${env.SCRAPER_SERVICE_URL} (${res.status})`);
  } catch (e) {
    console.log(`  ${y("–")} Scraper not reachable from here (${e.message}) ${dim("— ok if internal-only")}`);
  }
} else if (runLive && failed) {
  console.log(`\n${y("Skipping live tests — fix the missing vars above first.")}`);
}

// ---- summary ---------------------------------------------------------------
console.log("");
if (failed) {
  console.log(r("✗ Some required credentials are missing or invalid.\n"));
  process.exit(1);
} else {
  console.log(g("✓ All required credentials present" + (runLive ? " and validated." : ".") + "\n"));
  process.exit(0);
}
