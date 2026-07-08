#!/usr/bin/env node
/**
 * Backfill Smart VA Matching for every lead in SignalDesk AI.
 *
 * The ingestion trigger only fires for newly scraped leads, and the draft path
 * matches lazily on first open. This warms the cache for every existing lead so
 * each one already carries its VA recommendation.
 *
 * Leads that match nothing are LEFT EMPTY on purpose: lib/outreach.ts falls back
 * to promoting the VA Hub directory (with ?src/?lead attribution) whenever a lead
 * has no cached match. Nothing to store for that case.
 *
 * MIN_MATCH_SCORE and MATCH_TEXT_MAX_CHARS are parsed out of lib/va-matching.ts
 * rather than duplicated, so this script can never drift from the app.
 *
 * Safe by default: runs as a DRY RUN and only prints what it would do.
 *
 * Usage:
 *   node scripts/backfill-va-matches.mjs                 # dry run (.env.local)
 *   node scripts/backfill-va-matches.mjs --apply         # write matches
 *   node scripts/backfill-va-matches.mjs --apply --force # re-match already-matched leads
 *   node scripts/backfill-va-matches.mjs .env --apply    # use a specific env file
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const envFile = args.find((a) => !a.startsWith("--")) || ".env.local";

// Serial + spaced: VA Hub rate-limits with Upstash. Don't hammer it.
const DELAY_MS = 250;

// ---- colors ----------------------------------------------------------------
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const b = (s) => `\x1b[1m${s}\x1b[0m`;

// ---- tiny .env parser (no deps) -------------------------------------------
function loadEnv(file) {
  const path = resolve(repoRoot, file);
  if (!existsSync(path)) {
    console.error(r(`✗ Env file not found: ${path}`));
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
  return { ...env, ...process.env };
}

// ---- read the app's constants (single source of truth) ---------------------
function readConstants() {
  const src = readFileSync(resolve(repoRoot, "lib/va-matching.ts"), "utf-8");
  const num = (name) => {
    const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([0-9.]+)`));
    if (!m) {
      console.error(r(`✗ Could not parse ${name} from lib/va-matching.ts`));
      process.exit(1);
    }
    return Number(m[1]);
  };
  return { minScore: num("MIN_MATCH_SCORE"), maxChars: num("MATCH_TEXT_MAX_CHARS") };
}

// ---- mirror of buildMatchText() in lib/va-matching.ts ----------------------
function buildMatchText(leadText, ai, maxChars) {
  const parts = [];
  if (ai) {
    if (ai.leadSummary) parts.push(ai.leadSummary);
    if (ai.tasks?.length) parts.push(`Tasks: ${ai.tasks.join(", ")}`);
    if (ai.skills?.length) parts.push(`Skills: ${ai.skills.join(", ")}`);
    if (ai.tools?.length) parts.push(`Tools: ${ai.tools.join(", ")}`);
    if (ai.industry) parts.push(`Industry: ${ai.industry}`);
  }
  const composed = parts.length > 0 ? parts.join(". ") : leadText;
  return composed.trim().slice(0, maxChars);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function matchOne(baseUrl, secret, text, leadId, minScore) {
  const res = await fetch(`${baseUrl}/api/match-vas`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, leadId, limit: 3, source: "signaldesk" }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) {
    const retryAfter = Math.min(Number(res.headers.get("Retry-After") ?? 5) || 5, 30);
    console.log(y(`    429 — waiting ${retryAfter}s`));
    await sleep(retryAfter * 1000);
    return matchOne(baseUrl, secret, text, leadId, minScore);
  }
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`match-vas ${res.status}: ${error}`);
  }

  const { matches } = await res.json();
  return (matches ?? []).filter((m) => m.matchScore >= minScore);
}

// ---- main -----------------------------------------------------------------
const env = loadEnv(envFile);
const { minScore, maxChars } = readConstants();

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = env.VAHUB_BASE_URL?.replace(/\/+$/, "");
const secret = env.MATCH_API_SECRET;

for (const [k, v] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  VAHUB_BASE_URL: baseUrl,
  MATCH_API_SECRET: secret,
})) {
  if (!v) {
    console.error(r(`✗ Missing ${k} in ${envFile}`));
    process.exit(1);
  }
}

const supabase = createClient(supabaseUrl, serviceKey);

console.log(b("\nBackfill Smart VA Matching"));
console.log(dim(`  env        ${envFile}`));
console.log(dim(`  VA Hub     ${baseUrl}`));
console.log(dim(`  min score  ${minScore}  (from lib/va-matching.ts)`));
console.log(dim(`  max chars  ${maxChars}`));
console.log(dim(`  mode       ${apply ? (force ? "APPLY --force" : "APPLY") : "DRY RUN"}\n`));

const { data: leads, error: leadsErr } = await supabase
  .from("leads")
  .select("id, username, text, ai_qualification")
  .order("created_at", { ascending: true });
if (leadsErr) throw leadsErr;

const { data: existing, error: exErr } = await supabase
  .from("lead_va_matches")
  .select("lead_id");
if (exErr) throw exErr;
const alreadyMatched = new Set(existing.map((m) => m.lead_id));

const todo = force ? leads : leads.filter((l) => !alreadyMatched.has(l.id));

console.log(`${leads.length} leads, ${alreadyMatched.size} already matched → ${b(todo.length)} to process\n`);

if (!apply) {
  console.log(y("DRY RUN — no API calls, no writes. Re-run with --apply.\n"));
  for (const l of todo.slice(0, 5)) {
    const text = buildMatchText(l.text, l.ai_qualification, maxChars);
    console.log(dim(`  ${l.id.slice(0, 8)}  ${l.username.slice(0, 24).padEnd(24)} "${text.slice(0, 60)}…"`));
  }
  if (todo.length > 5) console.log(dim(`  … and ${todo.length - 5} more`));
  console.log();
  process.exit(0);
}

let matched = 0;
let noMatch = 0;
let failed = 0;

for (const [i, lead] of todo.entries()) {
  const label = `[${String(i + 1).padStart(3)}/${todo.length}] ${lead.username.slice(0, 24).padEnd(24)}`;
  const text = buildMatchText(lead.text, lead.ai_qualification, maxChars);

  if (!text) {
    console.log(`${label} ${y("skipped — empty text")}`);
    noMatch++;
    continue;
  }

  try {
    const matches = await matchOne(baseUrl, secret, text, lead.id, minScore);

    if (matches.length === 0) {
      // Intentionally store nothing: outreach falls back to the VA Hub home URL.
      console.log(`${label} ${y("no match")} ${dim(`— will promote VA Hub`)}`);
      noMatch++;
    } else {
      const rows = matches.map((m) => ({
        lead_id: lead.id,
        va_slug: m.slug,
        display_name: m.displayName,
        headshot_url: m.headshotUrl,
        skills: m.skills,
        years_of_experience: m.yearsOfExperience,
        availability: m.availability,
        profile_url: m.profileUrl,
        match_score: m.matchScore,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("lead_va_matches")
        .upsert(rows, { onConflict: "lead_id,va_slug" });
      if (error) throw error;

      console.log(`${label} ${g(`${matches.length} match`)} ${dim(`— top ${matches[0].displayName} @ ${matches[0].matchScore}`)}`);
      matched++;
    }
  } catch (err) {
    console.log(`${label} ${r("FAILED")} ${dim(String(err.message || err))}`);
    failed++;
  }

  if (i < todo.length - 1) await sleep(DELAY_MS);
}

console.log(b("\nSummary"));
console.log(`  ${g(`${matched} matched`)}      → outreach pitches a specific VA + profile URL`);
console.log(`  ${y(`${noMatch} no match`)}     → outreach promotes the VA Hub directory`);
if (failed) console.log(`  ${r(`${failed} failed`)}       → re-run to retry`);
console.log();
process.exit(failed > 0 ? 1 : 0);
