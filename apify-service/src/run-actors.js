import { config } from "./config.js";
import {
  runActor,
  buildFacebookInput, normalizeFacebookResult,
  buildLinkedInInput, normalizeLinkedInResult,
  buildRedditInput, normalizeRedditResult,
  buildXInput, normalizeXResult,
} from "./actors.js";
import { sendToBackend } from "./backend.js";
import { sendRunSummary } from "./discord.js";
import { preFilterPost } from "./keywords.js";

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function ts() {
  return new Date().toLocaleString("en-US", {
    hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit",
    month: "short", day: "2-digit",
  });
}

function log(msg) { console.log(`[${ts()}] ${msg}`); }
function logSection(title) {
  console.log(`\n${"─".repeat(60)}`);
  log(title);
  console.log("─".repeat(60));
}

function logPostDetail(index, post, filterResult) {
  const status = filterResult.rejected ? "REJECTED" : filterResult.pass ? "PASS" : "SKIP";
  const icon = status === "PASS" ? "+" : status === "REJECTED" ? "x" : "-";
  const preview = post.text.slice(0, 100).replace(/\n/g, " ");
  console.log(`  [${icon}] #${index + 1} | score=${String(filterResult.score).padStart(3)} | @${post.username.padEnd(20)} | ${preview}...`);
  if (filterResult.matchedTerms.length > 0) {
    console.log(`       matched: ${filterResult.matchedTerms.join(", ")}`);
  }
  if (filterResult.pass) {
    console.log(`       url: ${post.url}`);
  }
}

// ---------------------------------------------------------------------------
// Filter with detailed logging
// ---------------------------------------------------------------------------

function filterPosts(posts, platform) {
  const passed = [];
  let rejected = 0;
  let filtered = 0;

  logSection(`${platform} — Pre-filter (${posts.length} posts)`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const result = preFilterPost(post.text);
    logPostDetail(i, post, result);

    if (result.rejected) { rejected++; continue; }
    if (!result.pass) { filtered++; continue; }
    passed.push(post);
  }

  console.log();
  log(`${platform} filter results: ${passed.length} PASSED | ${filtered} low-intent | ${rejected} self-promo`);
  return passed;
}

// ---------------------------------------------------------------------------
// Platform runner with timing
// ---------------------------------------------------------------------------

async function runPlatform(name, actorId, input, normalizer) {
  logSection(`${name} — Starting actor: ${actorId}`);
  const startTime = Date.now();

  const rawPosts = await runActor(actorId, input, normalizer, name);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`${name} actor completed in ${elapsed}s — ${rawPosts.length} raw posts`);

  if (rawPosts.length === 0) {
    log(`${name} — No posts returned. Skipping filter & backend.`);
    return { platform: name, total: 0, passed: 0, inserted: 0, duplicates: 0, elapsed };
  }

  const posts = filterPosts(rawPosts, name);

  if (posts.length === 0) {
    log(`${name} — No posts passed filter. Skipping backend.`);
    return { platform: name, total: rawPosts.length, passed: 0, inserted: 0, duplicates: 0, elapsed };
  }

  logSection(`${name} — Sending ${posts.length} posts to backend`);
  const result = await sendToBackend(posts);

  const inserted = result?.inserted || 0;
  const duplicates = result?.duplicates || 0;

  if (result) {
    log(`${name} backend response: ${inserted} inserted, ${duplicates} duplicates`);
    if (result.results) {
      for (const r of result.results) {
        const icon = r.duplicate ? "DUP" : r.error ? "ERR" : `NEW score=${r.intentScore}`;
        console.log(`    [${icon}] ${r.url}`);
      }
    }
  } else {
    log(`${name} backend FAILED — no response`);
  }

  return { platform: name, total: rawPosts.length, passed: posts.length, inserted, duplicates, elapsed };
}

/**
 * Run all configured Apify actors and send results to the backend.
 * Can be called from the Express server or directly via CLI.
 * @returns {Promise<Array>} Summary of each platform run
 */
export async function runAllActors() {
  const cycleStart = Date.now();

  console.log("\n" + "=".repeat(60));
  log("SCRAPE CYCLE STARTED");
  console.log("=".repeat(60));
  log(`Config: FB=${config.targets.facebook.length} targets | LI=${config.targets.linkedin.length} | RD=${config.targets.reddit.length} | X=${config.targets.x.length}`);
  log(`Max results per actor: ${config.maxResultsPerRun}`);

  const summaries = [];

  // --- Facebook ---
  if (config.targets.facebook.length > 0) {
    const r = await runPlatform("Facebook", config.actors.facebook,
      buildFacebookInput(config.targets.facebook), normalizeFacebookResult);
    summaries.push(r);
  }

  // --- LinkedIn ---
  if (config.targets.linkedin.length > 0) {
    const r = await runPlatform("LinkedIn", config.actors.linkedin,
      buildLinkedInInput(config.targets.linkedin), normalizeLinkedInResult);
    summaries.push(r);
  }

  // --- Reddit ---
  if (config.targets.reddit.length > 0) {
    const r = await runPlatform("Reddit", config.actors.reddit,
      buildRedditInput(config.targets.reddit), normalizeRedditResult);
    summaries.push(r);
  }

  // --- X ---
  if (config.targets.x.length > 0) {
    const r = await runPlatform("X", config.actors.x,
      buildXInput(config.targets.x), normalizeXResult);
    summaries.push(r);
  }

  // --- Final Summary ---
  const totalScraped = summaries.reduce((s, r) => s + r.total, 0);
  const totalPassed = summaries.reduce((s, r) => s + (r.passed || 0), 0);
  const totalInserted = summaries.reduce((s, r) => s + r.inserted, 0);
  const totalDuplicates = summaries.reduce((s, r) => s + r.duplicates, 0);
  const cycleElapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  log("SCRAPE CYCLE COMPLETE");
  console.log("=".repeat(60));
  console.log();
  console.log("  Platform   | Scraped | Passed | Inserted | Dupes | Time");
  console.log("  " + "-".repeat(56));
  for (const s of summaries) {
    console.log(`  ${s.platform.padEnd(11)}| ${String(s.total).padStart(7)} | ${String(s.passed || 0).padStart(6)} | ${String(s.inserted).padStart(8)} | ${String(s.duplicates).padStart(5)} | ${s.elapsed || "?"}s`);
  }
  console.log("  " + "-".repeat(56));
  console.log(`  ${"TOTAL".padEnd(11)}| ${String(totalScraped).padStart(7)} | ${String(totalPassed).padStart(6)} | ${String(totalInserted).padStart(8)} | ${String(totalDuplicates).padStart(5)} | ${cycleElapsed}s`);
  console.log();
  log(`Next run in ${config.runIntervalMinutes} minutes`);
  console.log("=".repeat(60) + "\n");

  // Send Discord summary
  await sendRunSummary(summaries);

  return summaries;
}

// Allow running directly: node src/run-actors.js
const isDirectRun = process.argv[1]?.endsWith("run-actors.js");
if (isDirectRun) {
  runAllActors()
    .then((results) => {
      console.log("Results:", JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
