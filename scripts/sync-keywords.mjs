#!/usr/bin/env node
/**
 * Sync the Supabase `keywords` table to match the canonical default keyword
 * lists in lib/keywords.ts (DEFAULT_KEYWORDS).
 *
 * lib/keywords.ts is the single source of truth. This script:
 *   - INSERTS canonical keywords that are missing from the DB
 *   - DELETES DB keywords that are not in the canonical list (drift / typos)
 * so that, after running, the hardcoded list and the DB are identical.
 *
 * Safe by default: runs as a DRY RUN and only prints what it would do.
 * Pass --apply to actually write to the database.
 *
 * Usage:
 *   node scripts/sync-keywords.mjs                 # dry run (.env.local)
 *   node scripts/sync-keywords.mjs --apply         # apply changes
 *   node scripts/sync-keywords.mjs .env --apply    # use a specific env file
 *   node scripts/sync-keywords.mjs --seed-only     # only insert, never delete
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const seedOnly = args.includes("--seed-only");
const envFile = args.find((a) => !a.startsWith("--")) || ".env.local";

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

// ---- parse canonical keywords from lib/keywords.ts ------------------------
// lib/keywords.ts is the single source of truth. We parse the DEFAULT_KEYWORDS
// object with a string-aware scanner so that bracket characters inside string
// literals (e.g. "[hiring]") don't confuse array detection.
function parseCanonicalKeywords() {
  const src = readFileSync(resolve(repoRoot, "lib/keywords.ts"), "utf-8");
  const start = src.indexOf("DEFAULT_KEYWORDS: CategorizedKeywords");
  if (start === -1) {
    console.error(r("✗ Could not find DEFAULT_KEYWORDS in lib/keywords.ts"));
    process.exit(1);
  }
  const block = src.slice(start);

  function extractCategoryArray(text, key) {
    const keyIdx = text.indexOf(key + ":");
    if (keyIdx === -1) return [];
    const openIdx = text.indexOf("[", keyIdx);
    let depth = 0;
    let inStr = false;
    let end = openIdx;
    for (let i = openIdx; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === "\\") { i++; continue; }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = text.slice(openIdx + 1, end);
    const out = [];
    let cur = null;
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (cur === null) {
        if (c === '"') cur = "";
      } else if (c === "\\") {
        cur += body[j + 1];
        j++;
      } else if (c === '"') {
        out.push(cur);
        cur = null;
      } else {
        cur += c;
      }
    }
    return out;
  }

  return {
    high_intent: extractCategoryArray(block, "high_intent"),
    medium_intent: extractCategoryArray(block, "medium_intent"),
    negative: extractCategoryArray(block, "negative"),
  };
}

// ---- Supabase REST helpers -------------------------------------------------
function makeClient(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(r("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"));
    process.exit(1);
  }
  const base = `${url}/rest/v1/keywords`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  return {
    async list() {
      const res = await fetch(`${base}?select=id,keyword,category`, { headers });
      if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
    async insert(rows) {
      const res = await fetch(base, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
    },
    async deleteIds(ids) {
      const inList = `(${ids.join(",")})`;
      const res = await fetch(`${base}?id=in.${encodeURIComponent(inList)}`, {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=minimal" },
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status} ${await res.text()}`);
    },
  };
}

const k = (category, keyword) => `${category}::${keyword.toLowerCase()}`;

// ---------------------------------------------------------------------------
async function main() {
  const env = loadEnv(envFile);
  const client = makeClient(env);

  const canonical = parseCanonicalKeywords();
  const canonicalRows = [
    ...canonical.high_intent.map((kw) => ({ keyword: kw, category: "high_intent" })),
    ...canonical.medium_intent.map((kw) => ({ keyword: kw, category: "medium_intent" })),
    ...canonical.negative.map((kw) => ({ keyword: kw, category: "negative" })),
  ];
  const canonicalKeys = new Set(canonicalRows.map((row) => k(row.category, row.keyword)));

  console.log(`\n${b("Sync keywords")} ${dim(`(${apply ? "APPLY" : "DRY RUN"}${seedOnly ? ", seed-only" : ""})`)}`);
  console.log(dim(`env: ${envFile}`));
  console.log(
    `\nCanonical (lib/keywords.ts): ${b(canonicalRows.length)} ` +
      dim(`(${canonical.high_intent.length} high, ${canonical.medium_intent.length} medium, ${canonical.negative.length} negative)`)
  );

  const dbRows = await client.list();
  const dbKeys = new Set(dbRows.map((row) => k(row.category, row.keyword)));
  console.log(`Database (keywords table): ${b(dbRows.length)}`);

  const toInsert = canonicalRows.filter((row) => !dbKeys.has(k(row.category, row.keyword)));
  const toDelete = seedOnly
    ? []
    : dbRows.filter((row) => !canonicalKeys.has(k(row.category, row.keyword)));

  console.log(`\n${g("+ Insert")} ${toInsert.length} keyword(s) missing from DB:`);
  for (const row of toInsert) console.log(`  ${g("+")} [${row.category}] ${row.keyword}`);

  console.log(`\n${r("- Delete")} ${toDelete.length} keyword(s) not in canonical list:`);
  for (const row of toDelete) console.log(`  ${r("-")} [${row.category}] ${row.keyword}`);

  if (toInsert.length === 0 && toDelete.length === 0) {
    console.log(g("\n✓ Already in sync — nothing to do.\n"));
    return;
  }

  if (!apply) {
    console.log(y(`\nDry run only. Re-run with ${b("--apply")} to write these changes.\n`));
    return;
  }

  if (toInsert.length > 0) {
    await client.insert(toInsert);
    console.log(g(`\n✓ Inserted ${toInsert.length} keyword(s).`));
  }
  if (toDelete.length > 0) {
    await client.deleteIds(toDelete.map((row) => row.id));
    console.log(g(`✓ Deleted ${toDelete.length} keyword(s).`));
  }
  console.log(g("\n✓ Database now matches lib/keywords.ts.\n"));
}

main().catch((err) => {
  console.error(r(`\n✗ Sync failed: ${err.message}\n`));
  process.exit(1);
});
