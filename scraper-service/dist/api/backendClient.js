"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchKeywords = fetchKeywords;
exports.getCachedKeywords = getCachedKeywords;
exports.sendLeadsBatch = sendLeadsBatch;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const client = axios_1.default.create({
    baseURL: config_1.config.backendApiUrl,
    timeout: config_1.config.requestTimeoutMs,
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config_1.config.backendAuthToken}`,
        "X-Source": "signaldesk-scraper",
    },
});
/** Cached keywords — refreshed on each scraper run */
let cachedKeywords = null;
/**
 * Fetch user-configured keywords from the backend.
 * The scraper uses these for search queries, Google dorks, and post filtering.
 * Falls back to env var defaults if the backend is unreachable.
 */
async function fetchKeywords(forceRefresh = false) {
    if (cachedKeywords && !forceRefresh)
        return cachedKeywords;
    try {
        console.log("[backend] Fetching keywords from /api/keywords/search-queries...");
        const { data } = await client.get("/api/keywords/search-queries");
        if (data?.searchQueries?.length > 0) {
            cachedKeywords = data;
            console.log(`[backend] Keywords loaded: ${data.searchQueries.length} search queries, ${data.negativeKeywords.length} negative`);
            return cachedKeywords;
        }
        console.warn("[backend] No keywords returned from API — using env var defaults");
        return null;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[backend] Failed to fetch keywords: ${message} — using env var defaults`);
        return null;
    }
}
/** Get cached keywords (non-async, for use inside scrapers after initial fetch) */
function getCachedKeywords() {
    return cachedKeywords;
}
// ---------------------------------------------------------------------------
// Batch lead submission
// ---------------------------------------------------------------------------
async function sendLeadsBatch(posts) {
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
    console.log(`[backend] Sending ${validPosts.length} posts to ${config_1.config.backendApiUrl}/api/leads/batch`);
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
        const { data } = await client.post("/api/leads/batch", {
            posts: mapped,
        });
        console.log(`[backend] Response: ${data.inserted} inserted, ${data.duplicates} duplicates`);
        return data;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[backend] Failed to send batch: ${message}`);
        if (axios_1.default.isAxiosError(err) && err.response) {
            console.error(`[backend] Status: ${err.response.status}`, err.response.data);
        }
        return null;
    }
}
//# sourceMappingURL=backendClient.js.map