import type { ScrapeResult } from "../types";
export declare function isFacebookSearchUrl(url: string): boolean;
export declare function buildFacebookSearchUrl(keyword: string): string;
/**
 * Check if a post's text matches any of the given keywords.
 * Uses case-insensitive substring + word-boundary matching for accuracy.
 * Returns the list of matched keywords (empty = no match).
 */
export declare function matchKeywords(text: string, keywords: string[]): string[];
export declare function scrapeUrl(targetUrl: string): Promise<ScrapeResult>;
