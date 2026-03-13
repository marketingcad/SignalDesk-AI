import type { ScrapeResult } from "../types";
/**
 * Reddit Scraper — crawls public subreddit feeds using NEW reddit (www.reddit.com).
 * Uses the /new feed to get newest posts first, filters to current week only.
 * No login required.
 *
 * Strategy:
 *  1. Browser: www.reddit.com/r/{sub}/new — shreddit-post elements with attributes
 *  2. Fallback: Reddit JSON API — /r/{sub}/new.json for reliable structured data
 */
export declare function scrapeReddit(): Promise<ScrapeResult>;
