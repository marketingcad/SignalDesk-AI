import type { ScrapeResult } from "../types";
/**
 * Reddit Scraper — crawls public subreddit search pages.
 * No login required. Uses old.reddit.com for simpler HTML structure.
 */
export declare function scrapeReddit(): Promise<ScrapeResult>;
