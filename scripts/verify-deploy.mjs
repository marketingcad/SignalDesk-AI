#!/usr/bin/env node
/**
 * Pre-push deploy verifier.
 *
 * Reproduces how DigitalOcean builds your apps: from a CLEAN checkout of the
 * COMMITTED git contents (no local node_modules, no uncommitted or gitignored
 * files), with a fresh `npm ci` + build for each app. Catches the entire class
 * of "works on my machine, fails on DO" errors:
 *   - a dep installed locally but missing from package.json/lock
 *   - a source file that exists locally but is gitignored / uncommitted
 *   - the web build pulling in code it shouldn't compile
 *
 * Usage:
 *   node scripts/verify-deploy.mjs            # verify both apps
 *   node scripts/verify-deploy.mjs web        # web app only
 *   node scripts/verify-deploy.mjs scraper    # scraper only
 *
 * Exit 0 = both builds pass on a clean checkout. Exit 1 = something would fail
 * on DigitalOcean. Run it before `git push`.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const which = (process.argv[2] || "all").toLowerCase();
const APPS = [
  { id: "web", label: "Web app (Next.js)", dir: ".", build: "npm run build" },
  { id: "scraper", label: "Scraper service", dir: "scraper-service", build: "npm run build" },
];
const targets = which === "all" ? APPS : APPS.filter((a) => a.id === which);
if (!targets.length) {
  console.error(`Unknown target '${which}'. Use: web | scraper | all`);
  process.exit(1);
}

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

// Materialize the committed HEAD into a throwaway worktree (tracked files only).
const head = execSync("git rev-parse --short HEAD").toString().trim();
const dirty = execSync("git status --porcelain").toString().trim();
if (dirty) {
  console.log(
    dim(
      `\n⚠ You have uncommitted changes. This checks COMMITTED state (HEAD=${head}).\n` +
        `  Commit first so the check reflects what you're about to push.\n`
    )
  );
}

const work = mkdtempSync(join(tmpdir(), "deploy-verify-"));
console.log(`\nVerifying ${bold("committed")} state (HEAD=${head}) in a clean checkout…`);
console.log(dim(`  ${work}\n`));

let failed = false;
try {
  run(`git worktree add --detach --quiet "${work}" HEAD`, process.cwd());

  for (const app of targets) {
    const cwd = join(work, app.dir);
    console.log(bold(`\n━━ ${app.label} ━━`));
    try {
      console.log(dim("  npm ci…"));
      run("npm ci", cwd);
      console.log(dim(`  ${app.build}…`));
      run(app.build, cwd);
      console.log(g(`  ✓ ${app.label} builds clean`));
    } catch {
      console.log(r(`  ✗ ${app.label} FAILED — this would fail on DigitalOcean`));
      failed = true;
    }
  }
} finally {
  try {
    execSync(`git worktree remove --force "${work}"`, { stdio: "ignore" });
  } catch {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log("");
if (failed) {
  console.log(r("✗ A clean build failed. Fix it before pushing.\n"));
  process.exit(1);
}
console.log(g("✓ All target apps build clean from committed contents. Safe to push.\n"));
