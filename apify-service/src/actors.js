import { ApifyClient } from "apify-client";
import { config } from "./config.js";

const client = new ApifyClient({ token: config.apifyToken });

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
    timestamp: item.time || item.timestamp || item.date || new Date().toISOString(),
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
    timestamp: item.postedAt || item.publishedAt || item.date || new Date().toISOString(),
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
  return {
    platform: "Reddit",
    text: `${title} ${body}`.trim(),
    username: item.author || item.username || "Unknown",
    url: item.url || item.permalink
      ? (item.permalink?.startsWith("http") ? item.permalink : `https://www.reddit.com${item.permalink}`)
      : "",
    timestamp: item.createdAt || item.created_utc || item.date || new Date().toISOString(),
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
    timestamp: item.created_at || item.createdAt || item.date || new Date().toISOString(),
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

  console.log(`[apify] Starting ${platform} actor: ${actorId}`);
  console.log(`[apify] Input:`, JSON.stringify(input, null, 2));

  try {
    // Start the actor and wait for it to finish (up to 5 minutes)
    const run = await client.actor(actorId).call(input, {
      waitSecs: 300,
    });

    console.log(`[apify] ${platform} actor finished — run ID: ${run.id}, status: ${run.status}`);

    if (run.status !== "SUCCEEDED") {
      console.error(`[apify] ${platform} actor failed with status: ${run.status}`);
      return [];
    }

    // Fetch results from the actor's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems({
      limit: config.maxResultsPerRun,
    });

    console.log(`[apify] ${platform}: ${items.length} raw results`);

    // Normalize and filter
    const normalized = items
      .map((item) => {
        try {
          return normalizer(item);
        } catch (err) {
          console.warn(`[apify] ${platform}: failed to normalize item`, err.message);
          return null;
        }
      })
      .filter((post) => post && post.text && post.text.length > 20);

    console.log(`[apify] ${platform}: ${normalized.length} posts after normalization`);
    return normalized;
  } catch (err) {
    console.error(`[apify] ${platform} actor error:`, err.message);
    return [];
  }
}
