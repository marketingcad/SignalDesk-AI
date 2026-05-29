import type { ScrapedPost, ScrapeResult, BatchScrapeResult, BatchUrlResult } from "../types";
export declare function isFacebookSearchUrl(url: string): boolean;
export declare function buildFacebookSearchUrl(keyword: string): string;
/**
 * Check if a post's text matches any of the given keywords.
 * Uses case-insensitive substring + word-boundary matching for accuracy.
 * Returns the list of matched keywords (empty = no match).
 */
export declare function matchKeywords(text: string, keywords: string[]): string[];
export declare function scrapeUrl(targetUrl: string): Promise<ScrapeResult>;
/**
 * Scrape multiple URLs in a single browser session.
 * - Opens ONE browser + context, reuses across all URLs.
 * - Processes URLs sequentially with a short delay between each.
 * - If a URL fails, skips it and continues to the next.
 * - After all URLs are done, retries failed URLs once.
 * - Returns all collected posts in a single combined array.
 */
export declare function scrapeUrlsBatch(urls: string[], sourceName?: string): Promise<BatchScrapeResult>;
export declare function createBrowserContext(): Promise<{
    context: import("playwright").BrowserContext;
    browser: import("playwright").Browser | null;
}>;
export declare function scrapeOneUrl(context: import("playwright").BrowserContext, targetUrl: string, tag: string, label: string, source: string): Promise<{
    posts: ScrapedPost[];
    urlResult: BatchUrlResult;
}>;
