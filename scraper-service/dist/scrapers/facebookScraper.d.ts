import type { ScrapeResult } from "../types";
/**
 * Facebook Scraper — crawls publicly accessible Facebook group posts.
 * Uses Google dorking: site:facebook.com/groups "hiring virtual assistant"
 * Also supports direct public group page scraping for groups that allow
 * non-logged-in viewing.
 *
 * NOTE: Most Facebook groups require login. This scraper targets:
 * 1. Public group posts indexed by Google
 * 2. Public Facebook pages/posts
 * The existing Apify service + Chrome extension handle logged-in scraping.
 */
export declare function scrapeFacebook(): Promise<ScrapeResult>;
