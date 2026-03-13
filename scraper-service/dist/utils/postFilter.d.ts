import type { ScrapedPost } from "../types";
export declare function isJobSeeker(text: string): boolean;
/**
 * Filter scraped posts: remove too-short posts, job seekers, and duplicates.
 * @param tag - log prefix for context (e.g. "[crawler]" or "[url-scraper]")
 */
export declare function filterPosts(posts: ScrapedPost[], tag?: string): ScrapedPost[];
/**
 * Deduplicate posts by URL — strips query params and trailing slashes.
 * Used within extractors to avoid sending duplicates to backend.
 */
export declare function deduplicatePosts(posts: ScrapedPost[]): ScrapedPost[];
