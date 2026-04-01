import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load .env from multiple possible locations:
// - Dev: scraper-service/.env (../../.env from src/config/)
// - Bundled: scraper/.env (../../.env from dist/config/)
// - CWD fallback: process.cwd()/.env
const envCandidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env.local"),
  path.resolve(process.cwd(), ".env.local"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

function envOrDefault(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function envList(key: string, fallback: string): string[] {
  const val = process.env[key] || fallback;
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  // Backend
  backendApiUrl: envOrDefault("BACKEND_API_URL", "http://localhost:3000"),
  backendAuthToken: envOrDefault("BACKEND_AUTH_TOKEN", ""),

  // Supabase (optional — enables durable schedule persistence instead of JSON files)
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  // Discord
  discordWebhookUrl: envOrDefault("DISCORD_WEBHOOK_URL", ""),

  // Server
  port: parseInt(envOrDefault("PORT", "4000"), 10),

  // Cron schedules (defaults tuned for free-tier: avoid Google IP bans)
  cron: {
    reddit: envOrDefault("CRON_REDDIT", "0 */1 * * *"),
    x: envOrDefault("CRON_X", "15 */1 * * *"),
    linkedin: envOrDefault("CRON_LINKEDIN", "30 */2 * * *"),
    facebook: envOrDefault("CRON_FACEBOOK", "45 */2 * * *"),
  },

  // Targets
  targets: {
    redditSubreddits: envList(
      "REDDIT_SUBREDDITS",
      "virtualassistant,hiring,forhire,smallbusiness,entrepreneur,RemoteWork,WorkOnline,sidehustle,ecommerce,realestateinvesting,Bookkeeping,socialmediamarketing"
    ),
    xSearchQueries: envList(
      "X_SEARCH_QUERIES",
      "hiring virtual assistant,need a VA,looking for VA,hire a va,va needed,hiring remote assistant,hiring executive assistant remote,hiring ghl va,hiring social media va,hiring real estate va,hiring cold caller va,hiring appointment setter,need admin support,need someone to manage my crm,any va recommendations,recommend a good va,where to hire a va,overwhelmed with admin,scaling my business and need help,hiring GoHighLevel va,need someone for clickfunnels,hiring bookkeeping va,need va for hubspot,need va for salesforce"
    ),
    linkedinSearchQueries: envList(
      "LINKEDIN_SEARCH_QUERIES",
      "hiring virtual assistant,need VA for business,looking for a virtual assistant,hire a virtual assistant,virtual assistant needed,hiring remote assistant,hiring executive assistant remote,need admin support,outsourcing admin work,where to find a va,thinking of hiring a va,need someone to manage my crm,overwhelmed with admin,hiring ghl va,hiring appointment setter"
    ),
    facebookSearchQueries: envList(
      "FACEBOOK_SEARCH_QUERIES",
      "hiring virtual assistant,need a VA,looking for virtual assistant,hire VA for business,hiring remote assistant,need admin support,hiring appointment setter,hiring social media va,looking for a va,overwhelmed need help,hiring ghl va,need someone to manage my crm"
    ),
    facebookGroupUrls: envList("FACEBOOK_GROUP_URLS", ""),
  },

  // Limits
  maxResultsPerRun: parseInt(envOrDefault("MAX_RESULTS_PER_RUN", "50"), 10),
  scrollDelayMs: parseInt(envOrDefault("SCROLL_DELAY_MS", "2000"), 10),
  requestTimeoutMs: parseInt(envOrDefault("REQUEST_TIMEOUT_MS", "30000"), 10),

  // Browser
  headless: envOrDefault("HEADLESS", "true") === "true",

  // Retry logic for failed scrapes
  scrapeRetryAttempts: parseInt(envOrDefault("SCRAPE_RETRY_ATTEMPTS", "1"), 10),
  scrapeRetryDelayMs: parseInt(envOrDefault("SCRAPE_RETRY_DELAY_MS", "30000"), 10),

  // Keyword cache TTL (milliseconds) — avoids repeated API calls during burst scraping
  keywordCacheTtlMs: parseInt(envOrDefault("KEYWORD_CACHE_TTL_MS", "300000"), 10), // 5 minutes

  // Per-platform rate limiting — minimum gap (ms) between scrapes for the same platform
  platformRateLimitMs: {
    Facebook: parseInt(envOrDefault("RATE_LIMIT_FACEBOOK_MS", "300000"), 10),  // 5 min
    LinkedIn: parseInt(envOrDefault("RATE_LIMIT_LINKEDIN_MS", "300000"), 10),  // 5 min
    Reddit: parseInt(envOrDefault("RATE_LIMIT_REDDIT_MS", "60000"), 10),       // 1 min
    X: parseInt(envOrDefault("RATE_LIMIT_X_MS", "60000"), 10),                 // 1 min
    Other: parseInt(envOrDefault("RATE_LIMIT_OTHER_MS", "10000"), 10),         // 10 sec
  } as Record<string, number>,

  // Minimum post character length per platform (posts shorter than this are filtered)
  minPostLength: {
    Facebook: parseInt(envOrDefault("MIN_POST_LENGTH_FACEBOOK", "20"), 10),
    LinkedIn: parseInt(envOrDefault("MIN_POST_LENGTH_LINKEDIN", "20"), 10),
    Reddit: parseInt(envOrDefault("MIN_POST_LENGTH_REDDIT", "20"), 10),
    X: parseInt(envOrDefault("MIN_POST_LENGTH_X", "10"), 10),
    Other: parseInt(envOrDefault("MIN_POST_LENGTH_OTHER", "20"), 10),
  } as Record<string, number>,

  // Session health — alert after N consecutive runs with 0 posts
  sessionHealthThreshold: parseInt(envOrDefault("SESSION_HEALTH_THRESHOLD", "3"), 10),
};
