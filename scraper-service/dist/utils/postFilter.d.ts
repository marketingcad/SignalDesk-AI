import type { ScrapedPost } from "../types";
export declare function isJobSeeker(text: string): boolean;
/**
 * Filter scraped posts: remove too-short posts and job seekers.
 * @param tag - log prefix for context (e.g. "[crawler]" or "[url-scraper]")
 */
export declare function filterPosts(posts: ScrapedPost[], tag?: string): ScrapedPost[];
