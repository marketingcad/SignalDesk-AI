import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

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

  // Discord
  discordWebhookUrl: envOrDefault("DISCORD_WEBHOOK_URL", ""),

  // Server
  port: parseInt(envOrDefault("PORT", "4000"), 10),

  // Cron schedules
  cron: {
    reddit: envOrDefault("CRON_REDDIT", "*/15 * * * *"),
    x: envOrDefault("CRON_X", "*/5 * * * *"),
    linkedin: envOrDefault("CRON_LINKEDIN", "*/10 * * * *"),
    facebook: envOrDefault("CRON_FACEBOOK", "*/30 * * * *"),
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
};
