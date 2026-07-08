import type { ScrapedPost, ScrapeResult, BatchScrapeResult, BatchUrlResult } from "../types";
export declare function isFacebookSearchUrl(url: string): boolean;
export declare function buildFacebookSearchUrl(keyword: string): string;
export interface GraphQLPost {
    postId: string;
    author: string;
    text: string;
    timestamp: string;
    permalink: string;
    groupId: string;
    groupName: string;
}
/**
 * Identity key for a Facebook post, used to dedupe copies of the SAME post that
 * arrive from different GraphQL node shapes — one with a numeric permalink +
 * real author, one with a base64 ("UzpfST...") permalink + "unknown" author.
 * We recover the numeric FB post id from a plain permalink, or by base64-decoding
 * the encoded one (which embeds "...:VK:<numericId>"), and fall back to the text.
 */
export declare function fbPostKey(p: GraphQLPost): string;
/** Pick the richer of two duplicate posts: prefer a known author, then a numeric permalink. */
export declare function richerFbPost(a: GraphQLPost, b: GraphQLPost): GraphQLPost;
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
