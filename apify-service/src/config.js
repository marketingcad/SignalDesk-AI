import "dotenv/config";

function parseJsonEnv(key, fallback = []) {
  try {
    const raw = process.env[key];
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    console.warn(`[config] Failed to parse ${key} — using default`);
    return fallback;
  }
}

export const config = {
  // Apify
  apifyToken: process.env.APIFY_API_TOKEN || "",

  // Actor IDs
  actors: {
    facebook: process.env.APIFY_ACTOR_FACEBOOK || "apify/facebook-groups-scraper",
    linkedin: process.env.APIFY_ACTOR_LINKEDIN || "curious_coder/linkedin-post-search-scraper",
    reddit: process.env.APIFY_ACTOR_REDDIT || "trudax/reddit-scraper-lite",
    x: process.env.APIFY_ACTOR_X || "quacker/twitter-scraper",
  },

  // Targets
  targets: {
    facebook: parseJsonEnv("FACEBOOK_TARGETS"),
    linkedin: parseJsonEnv("LINKEDIN_TARGETS"),
    reddit: parseJsonEnv("REDDIT_TARGETS"),
    x: parseJsonEnv("X_TARGETS"),
  },

  // Backend
  backendApiUrl: process.env.BACKEND_API_URL || "http://localhost:3000",
  backendAuthToken: process.env.BACKEND_AUTH_TOKEN || "",

  // Discord
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",

  // Server
  port: parseInt(process.env.PORT || "4000", 10),

  // Limits
  maxResultsPerRun: parseInt(process.env.MAX_RESULTS_PER_RUN || "50", 10),
  runIntervalMinutes: parseInt(process.env.RUN_INTERVAL_MINUTES || "60", 10),
};
