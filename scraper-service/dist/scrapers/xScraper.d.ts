import type { ScrapeResult } from "../types";
/**
 * X (Twitter) Scraper — uses Google dorking for public tweet search.
 * Nitter instances are unreliable/dead, so we use:
 *   site:x.com "hiring virtual assistant"
 * to find publicly indexed tweets.
 * Google's &tbs=qdr:w filter ensures results are from the past week.
 */
export declare function scrapeX(): Promise<ScrapeResult>;
