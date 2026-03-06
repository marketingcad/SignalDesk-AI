import { ApifyClient } from "apify-client";
import { config } from "./config.js";

const client = new ApifyClient({ token: config.apifyToken });

/** Convert any timestamp (Unix number, string, or missing) to ISO string */
function toISOTimestamp(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === "number") {
    // Unix timestamps < 1e12 are in seconds, otherwise milliseconds
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  return String(value);
}

/**
 * Platform-specific actor configurations.
 * Each defines the actor ID, how to build the input, and how to normalize the output.
 */

// ---------------------------------------------------------------------------
// Facebook Groups
// ---------------------------------------------------------------------------

export function buildFacebookInput(groupUrls) {
  return {
    startUrls: groupUrls.map((url) => ({ url })),
    maxPosts: config.maxResultsPerRun,
    maxComments: 0,
    maxPostComments: 0,
  };
}

export function normalizeFacebookResult(item) {
  return {
    platform: "Facebook",
    text: item.text || item.message || item.postText || "",
    username: item.user?.name || item.authorName || item.userName || "Unknown",
    url: item.url || item.postUrl || item.link || "",
    timestamp: toISOTimestamp(item.time || item.timestamp || item.date),
    engagement: (item.likes || 0) + (item.comments || 0) + (item.shares || 0),
    source: "apify",
  };
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

export function buildLinkedInInput(searchTerms) {
  return {
    searchTerms,
    maxResults: config.maxResultsPerRun,
    deepScrape: false,
    minLikes: 0,
  };
}

export function normalizeLinkedInResult(item) {
  return {
    platform: "LinkedIn",
    text: item.text || item.postText || item.content || "",
    username: item.authorName || item.author?.name || item.profileName || "Unknown",
    url: item.url || item.postUrl || item.link || "",
    timestamp: toISOTimestamp(item.postedAt || item.publishedAt || item.date),
    engagement: (item.numLikes || 0) + (item.numComments || 0) + (item.numShares || 0),
    source: "apify",
  };
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

export function buildRedditInput(subreddits) {
  return {
    startUrls: subreddits.map((sub) => ({
      url: sub.startsWith("http") ? sub : `https://www.reddit.com/r/${sub}/new/`,
    })),
    maxItems: config.maxResultsPerRun,
    maxPostCount: config.maxResultsPerRun,
    sort: "new",
  };
}

export function normalizeRedditResult(item) {
  const title = item.title || "";
  const body = item.body || item.selftext || item.text || "";

  // Handle URL — permalink may be relative
  let url = item.url || "";
  if (!url && item.permalink) {
    url = item.permalink.startsWith("http")
      ? item.permalink
      : `https://www.reddit.com${item.permalink}`;
  }

  return {
    platform: "Reddit",
    text: `${title} ${body}`.trim(),
    username: item.author || item.username || "Unknown",
    url,
    timestamp: toISOTimestamp(item.createdAt || item.created_utc || item.date),
    engagement: (item.score || 0) + (item.numComments || item.num_comments || 0),
    source: "apify",
  };
}

// ---------------------------------------------------------------------------
// X / Twitter
// ---------------------------------------------------------------------------

export function buildXInput(searchQueries) {
  return {
    searchTerms: searchQueries,
    maxTweets: config.maxResultsPerRun,
    sort: "Latest",
    tweetLanguage: "en",
  };
}

export function normalizeXResult(item) {
  return {
    platform: "X",
    text: item.full_text || item.text || item.tweetText || "",
    username: item.user?.screen_name || item.username || item.author || "Unknown",
    url: item.url || item.tweetUrl ||
      (item.id ? `https://x.com/i/status/${item.id}` : ""),
    timestamp: toISOTimestamp(item.created_at || item.createdAt || item.date),
    engagement: (item.favorite_count || item.likes || 0) + (item.retweet_count || item.retweets || 0),
    source: "apify",
  };
}

// ---------------------------------------------------------------------------
// Runner: call an actor, wait for results, normalize
// ---------------------------------------------------------------------------

/**
 * Run an Apify actor and return normalized results.
 * @param {string} actorId - The Apify actor ID (e.g. "apify/facebook-groups-scraper")
 * @param {object} input - Actor input configuration
 * @param {function} normalizer - Function to normalize each result item
 * @param {string} platform - Platform name for logging
 * @returns {Promise<Array>} Normalized post objects
 */
export async function runActor(actorId, input, normalizer, platform) {
  if (!config.apifyToken) {
    console.error(`[apify] No APIFY_API_TOKEN configured — skipping ${platform}`);
    return [];
  }

  console.log(`[apify] ${platform} — calling actor: ${actorId}`);
  console.log(`[apify] ${platform} — input: ${JSON.stringify(input)}`);
  console.log(`[apify] ${platform} — waiting for actor to finish (max 5 min)...`);

  try {
    const startTime = Date.now();
    const run = await client.actor(actorId).call(input, {
      waitSecs: 300,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[apify] ${platform} — actor finished in ${elapsed}s`);
    console.log(`[apify] ${platform} — run ID: ${run.id} | status: ${run.status} | dataset: ${run.defaultDatasetId}`);

    if (run.status !== "SUCCEEDED") {
      console.error(`[apify] ${platform} — FAILED with status: ${run.status}`);
      if (run.statusMessage) console.error(`[apify] ${platform} — message: ${run.statusMessage}`);
      return [];
    }

    // Fetch results from the actor's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems({
      limit: config.maxResultsPerRun,
    });

    console.log(`[apify] ${platform} — fetched ${items.length} items from dataset`);

    // Normalize and filter
    let normFailed = 0;
    let tooShort = 0;
    const normalized = [];

    for (const item of items) {
      try {
        const post = normalizer(item);
        if (!post || !post.text) { normFailed++; continue; }
        if (post.text.length <= 20) { tooShort++; continue; }
        normalized.push(post);
      } catch (err) {
        normFailed++;
        console.warn(`[apify] ${platform} — normalize error: ${err.message}`);
      }
    }

    console.log(`[apify] ${platform} — ${normalized.length} valid posts (${normFailed} normalize errors, ${tooShort} too short)`);
    return normalized;
  } catch (err) {
    console.error(`[apify] ${platform} — ACTOR ERROR: ${err.message}`);
    if (err.statusCode) console.error(`[apify] ${platform} — HTTP ${err.statusCode}`);
    return [];
  }
}
