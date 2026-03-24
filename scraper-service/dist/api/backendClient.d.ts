import type { ScrapedPost } from "../types";
export interface BatchResponse {
    success: boolean;
    processed: number;
    inserted: number;
    duplicates: number;
    results: Array<{
        url: string;
        leadId?: string;
        intentScore?: number;
        intentLevel?: string;
        matchedKeywords?: string[];
        duplicate?: boolean;
        error?: string;
    }>;
}
export interface KeywordConfig {
    searchQueries: string[];
    negativeKeywords: string[];
    scoringConfig: {
        high_intent: string[];
        medium_intent: string[];
        negative: string[];
    };
}
/**
 * Fetch user-configured keywords from the backend.
 * The scraper uses these for search queries, Google dorks, and post filtering.
 * Falls back to env var defaults if the backend is unreachable.
 */
export declare function fetchKeywords(forceRefresh?: boolean): Promise<KeywordConfig | null>;
/** Get cached keywords (non-async, for use inside scrapers after initial fetch) */
export declare function getCachedKeywords(): KeywordConfig | null;
export declare function sendLeadsBatch(posts: ScrapedPost[]): Promise<BatchResponse | null>;
