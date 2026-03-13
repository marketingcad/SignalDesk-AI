import type { ScrapeResult } from "../types";
/**
 * LinkedIn Scraper — crawls public LinkedIn post search via Google.
 * LinkedIn blocks direct scraping without login, so we use
 * Google dorking: site:linkedin.com/posts "hiring virtual assistant"
 * Google's &tbs=qdr:w filter ensures results are from the past week.
 */
export declare function scrapeLinkedin(): Promise<ScrapeResult>;
