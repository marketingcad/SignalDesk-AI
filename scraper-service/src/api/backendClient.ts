import axios from "axios";
import { config } from "../config";
import type { ScrapedPost } from "../types";

const client = axios.create({
  baseURL: config.backendApiUrl,
  timeout: config.requestTimeoutMs,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.backendAuthToken}`,
    "X-Source": "signaldesk-scraper",
  },
});

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

// ---------------------------------------------------------------------------
// Keyword config — fetched from /settings page keywords (Supabase)
// ---------------------------------------------------------------------------

export interface KeywordConfig {
  searchQueries: string[];
  negativeKeywords: string[];
  scoringConfig: {
    high_intent: string[];
    medium_intent: string[];
    negative: string[];
  };
}

/** Cached keywords — refreshed on each scraper run */
let cachedKeywords: KeywordConfig | null = null;

/**
 * Fetch user-configured keywords from the backend.
 * The scraper uses these for search queries, Google dorks, and post filtering.
 * Falls back to env var defaults if the backend is unreachable.
 */
export async function fetchKeywords(forceRefresh = false): Promise<KeywordConfig | null> {
  if (cachedKeywords && !forceRefresh) return cachedKeywords;

  try {
    console.log("[backend] Fetching keywords from /api/keywords/search-queries...");
    const { data } = await client.get<KeywordConfig>("/api/keywords/search-queries");

    if (data?.searchQueries?.length > 0) {
      cachedKeywords = data;
      console.log(
        `[backend] Keywords loaded: ${data.searchQueries.length} search queries, ${data.negativeKeywords.length} negative`
      );
      return cachedKeywords;
    }

    console.warn("[backend] No keywords returned from API — using env var defaults");
    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backend] Failed to fetch keywords: ${message} — using env var defaults`);
    return null;
  }
}

/** Get cached keywords (non-async, for use inside scrapers after initial fetch) */
export function getCachedKeywords(): KeywordConfig | null {
  return cachedKeywords;
}

// ---------------------------------------------------------------------------
// Batch lead submission
// ---------------------------------------------------------------------------

export async function sendLeadsBatch(
  posts: ScrapedPost[]
): Promise<BatchResponse | null> {
  if (posts.length === 0) {
    console.log("[backend] No posts to send");
    return null;
  }

  // Filter out posts with unknown authors — their URLs are broken/unusable
  const validPosts = posts.filter((p) => {
    if (!p.author || p.author.toLowerCase() === "unknown" || p.author.startsWith("urn:li:")) {
      console.log(`[backend] Skipping post with unknown/invalid author: "${p.author}" — ${p.url}`);
      return false;
    }
    return true;
  });

  if (validPosts.length === 0) {
    console.log(`[backend] All ${posts.length} posts had unknown authors — nothing to send`);
    return null;
  }

  if (validPosts.length < posts.length) {
    console.log(`[backend] Filtered out ${posts.length - validPosts.length} posts with unknown authors`);
  }

  console.log(`[backend] Sending ${validPosts.length} posts to ${config.backendApiUrl}/api/leads/batch`);

  try {
    // Map scraper fields to what the batch API expects
    const mapped = validPosts.map((p) => ({
      platform: p.platform,
      username: p.author,
      text: p.text,
      url: p.url,
      timestamp: p.timestamp,
      engagement: p.engagement,
      source: p.source,
    }));

    const { data } = await client.post<BatchResponse>("/api/leads/batch", {
      posts: mapped,
    });

    console.log(
      `[backend] Response: ${data.inserted} inserted, ${data.duplicates} duplicates`
    );

    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backend] Failed to send batch: ${message}`);

    if (axios.isAxiosError(err) && err.response) {
      console.error(`[backend] Status: ${err.response.status}`, err.response.data);
    }

    return null;
  }
}
