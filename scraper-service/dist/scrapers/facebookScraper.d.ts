import type { ScrapeResult } from "../types";
/**
 * Facebook Scraper — crawls publicly accessible Facebook group posts.
 *
 * Two strategies:
 * 1. Google dorking: site:facebook.com/groups "hiring virtual assistant"
 *    Returns Google-indexed group posts with direct permalinks.
 *
 * 2. Direct group URLs (from config): opens the group page and extracts
 *    individual post permalinks from div[role="article"] containers.
 *    Looks for /posts/, /permalink/, story_fbid patterns inside each post.
 *
 * NOTE: Most Facebook groups require login. Strategy 2 works best with
 * saved cookies via browserAuth. The Apify service + Chrome extension
 * handle logged-in scraping as a complement.
 */
export declare function scrapeFacebook(): Promise<ScrapeResult>;
