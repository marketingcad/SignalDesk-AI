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

/**
 * Filter posts through keyword pre-filter before sending to backend.
 * Drops self-promotion and low-relevance posts.
 */
function filterPosts(posts, platform) {
  const passed = [];
  let rejected = 0;
  let filtered = 0;

  for (const post of posts) {
    const result = preFilterPost(post.text);
    if (result.rejected) {
      rejected++;
      continue;
    }
    if (!result.pass) {
      filtered++;
      continue;
    }
    passed.push(post);
  }

  console.log(`[runner] ${platform} pre-filter: ${passed.length} passed, ${filtered} low-intent, ${rejected} self-promo rejected`);
  return passed;
}

/**
 * Run all configured Apify actors and send results to the backend.
 * Can be called from the Express server or directly via CLI.
 * @returns {Promise<Array>} Summary of each platform run
 */
export async function runAllActors() {
  console.log("\n========================================");
  console.log("[runner] Starting Apify scrape cycle");
  console.log("========================================\n");

  const summaries = [];

  // --- Facebook ---
  if (config.targets.facebook.length > 0) {
    console.log(`[runner] Facebook: ${config.targets.facebook.length} group(s)`);
    const rawPosts = await runActor(
      config.actors.facebook,
      buildFacebookInput(config.targets.facebook),
      normalizeFacebookResult,
      "Facebook"
    );
    const posts = filterPosts(rawPosts, "Facebook");
    const result = await sendToBackend(posts);
    summaries.push({
      platform: "Facebook",
      total: rawPosts.length,
      inserted: result?.inserted || 0,
      duplicates: result?.duplicates || 0,
    });
  }

  // --- LinkedIn ---
  if (config.targets.linkedin.length > 0) {
    console.log(`[runner] LinkedIn: ${config.targets.linkedin.length} search term(s)`);
    const rawPosts = await runActor(
      config.actors.linkedin,
      buildLinkedInInput(config.targets.linkedin),
      normalizeLinkedInResult,
      "LinkedIn"
    );
    const posts = filterPosts(rawPosts, "LinkedIn");
    const result = await sendToBackend(posts);
    summaries.push({
      platform: "LinkedIn",
      total: rawPosts.length,
      inserted: result?.inserted || 0,
      duplicates: result?.duplicates || 0,
    });
  }

  // --- Reddit ---
  if (config.targets.reddit.length > 0) {
    console.log(`[runner] Reddit: ${config.targets.reddit.length} subreddit(s)`);
    const rawPosts = await runActor(
      config.actors.reddit,
      buildRedditInput(config.targets.reddit),
      normalizeRedditResult,
      "Reddit"
    );
    const posts = filterPosts(rawPosts, "Reddit");
    const result = await sendToBackend(posts);
    summaries.push({
      platform: "Reddit",
      total: rawPosts.length,
      inserted: result?.inserted || 0,
      duplicates: result?.duplicates || 0,
    });
  }

  // --- X ---
  if (config.targets.x.length > 0) {
    console.log(`[runner] X: ${config.targets.x.length} search query/queries`);
    const rawPosts = await runActor(
      config.actors.x,
      buildXInput(config.targets.x),
      normalizeXResult,
      "X"
    );
    const posts = filterPosts(rawPosts, "X");
    const result = await sendToBackend(posts);
    summaries.push({
      platform: "X",
      total: rawPosts.length,
      inserted: result?.inserted || 0,
      duplicates: result?.duplicates || 0,
    });
  }

  // --- Summary ---
  const totalInserted = summaries.reduce((s, r) => s + r.inserted, 0);
  const totalScraped = summaries.reduce((s, r) => s + r.total, 0);

  console.log("\n========================================");
  console.log(`[runner] Scrape cycle complete`);
  console.log(`[runner] Total scraped: ${totalScraped}, New leads: ${totalInserted}`);
  console.log("========================================\n");

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
