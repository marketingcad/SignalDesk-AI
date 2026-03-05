/**
 * Quick test: Run Reddit actor only with a small limit,
 * then send results through the full pipeline.
 *
 * Usage: node src/test-run.js
 */
import { config } from "./config.js";
import { runActor, buildRedditInput, normalizeRedditResult } from "./actors.js";
import { sendToBackend } from "./backend.js";
import { sendRunSummary } from "./discord.js";
import { preFilterPost } from "./keywords.js";

// Override max results to keep the test small and cheap
config.maxResultsPerRun = 10;

console.log("\n========================================");
console.log("  SignalDesk Apify - Test Run (Reddit)");
console.log("========================================\n");
console.log(`Apify token: ${config.apifyToken ? "configured" : "NOT SET"}`);
console.log(`Backend URL: ${config.backendApiUrl}`);
console.log(`Backend token: ${config.backendAuthToken ? "configured" : "NOT SET"}`);
console.log(`Discord webhook: ${config.discordWebhookUrl ? "configured" : "NOT SET"}`);
console.log();

// Use just one subreddit for testing
const testSubreddits = ["virtualassistant"];

console.log(`[test] Scraping r/${testSubreddits[0]} (limit: 10 posts)...\n`);

try {
  // Step 1: Run Apify actor
  const rawPosts = await runActor(
    config.actors.reddit,
    buildRedditInput(testSubreddits),
    normalizeRedditResult,
    "Reddit"
  );

  console.log(`\n[test] Raw posts from Apify: ${rawPosts.length}`);

  if (rawPosts.length === 0) {
    console.log("[test] No posts returned. Check your Apify token and actor ID.");
    process.exit(1);
  }

  // Step 2: Pre-filter with keywords
  const passed = [];
  let rejected = 0;
  let filtered = 0;

  for (const post of rawPosts) {
    const result = preFilterPost(post.text);
    console.log(`  [${result.pass ? "PASS" : result.rejected ? "REJECT" : "SKIP"}] score=${result.score} "${post.text.slice(0, 80)}..."`);
    if (result.rejected) { rejected++; continue; }
    if (!result.pass) { filtered++; continue; }
    passed.push(post);
  }

  console.log(`\n[test] Pre-filter: ${passed.length} passed, ${filtered} low-intent, ${rejected} self-promo`);

  // Step 3: Send to backend
  if (passed.length > 0) {
    console.log(`\n[test] Sending ${passed.length} posts to backend...`);
    const result = await sendToBackend(passed);
    console.log("[test] Backend result:", result);

    // Step 4: Send Discord summary
    const summaries = [{
      platform: "Reddit",
      total: rawPosts.length,
      inserted: result?.inserted || 0,
      duplicates: result?.duplicates || 0,
    }];
    await sendRunSummary(summaries);
  } else {
    console.log("\n[test] No posts passed the keyword filter — nothing sent to backend.");
    console.log("[test] This is normal if r/virtualassistant has no hiring posts right now.");

    // Still send a Discord summary so you can see it works
    await sendRunSummary([{
      platform: "Reddit",
      total: rawPosts.length,
      inserted: 0,
      duplicates: 0,
    }]);
  }

  console.log("\n========================================");
  console.log("  Test complete!");
  console.log("========================================\n");
  console.log("Check:");
  console.log("  1. Supabase 'leads' table for new rows");
  console.log("  2. Discord channel for notification");
  console.log();

  process.exit(0);
} catch (err) {
  console.error("\n[test] Fatal error:", err);
  process.exit(1);
}
