"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isJobSeeker = isJobSeeker;
exports.filterPosts = filterPosts;
exports.deduplicatePosts = deduplicatePosts;
const backendClient_1 = require("../api/backendClient");
const config_1 = require("../config");
// ---------------------------------------------------------------------------
// Shared post pre-filter — reject job seekers and self-promotion
// Used by both crawlerManager (scheduled runs) and urlScraper (manual URL scrapes)
// ---------------------------------------------------------------------------
const REJECT_PATTERNS = [
    /\bi(?:'m| am) a virtual assistant\b/i,
    /\blooking for (?:va |virtual assistant )(?:work|job|position|role)/i,
    /\bhire me\b/i,
    /\bva available\b/i,
    /\bfreelance va here\b/i,
    /\bavailable for hire\b/i,
    /\bopen for clients\b/i,
    /\bi provide va services\b/i,
    /\bmy services include\b/i,
    /\b\[for hire\]\b/i,
    /\boffering va services\b/i,
    /\bdm me for rates\b/i,
    /\blooking for work\b/i,
    /\blooking for clients\b/i,
    /\bservices i offer\b/i,
    /\bi can be your va\b/i,
    /\bi will be your virtual assistant\b/i,
    /\bdm for rates\b/i,
];
function isJobSeeker(text) {
    // Check hardcoded patterns first
    if (REJECT_PATTERNS.some((pattern) => pattern.test(text)))
        return true;
    // Check dynamic negative keywords from /settings
    const cached = (0, backendClient_1.getCachedKeywords)();
    if (cached?.negativeKeywords?.length) {
        const lower = text.toLowerCase();
        if (cached.negativeKeywords.some((kw) => lower.includes(kw.toLowerCase())))
            return true;
    }
    return false;
}
/**
 * Filter scraped posts: remove too-short posts, job seekers, and duplicates.
 * @param tag - log prefix for context (e.g. "[crawler]" or "[url-scraper]")
 */
function filterPosts(posts, tag = "[filter]") {
    const seenUrls = new Set();
    return posts.filter((post) => {
        const minLen = config_1.config.minPostLength[post.platform] ?? 20;
        if (!post.text || post.text.trim().length < minLen)
            return false;
        if (isJobSeeker(post.text)) {
            console.log(`${tag} Filtered job seeker: "${post.text.slice(0, 80)}..."`);
            return false;
        }
        // Deduplicate by URL within the same run
        if (post.url) {
            const normalizedUrl = post.url.split("?")[0].replace(/\/+$/, "");
            if (seenUrls.has(normalizedUrl)) {
                console.log(`${tag} Filtered duplicate URL: ${post.url.slice(0, 80)}`);
                return false;
            }
            seenUrls.add(normalizedUrl);
        }
        return true;
    });
}
/**
 * Deduplicate posts by URL — strips query params and trailing slashes.
 * Used within extractors to avoid sending duplicates to backend.
 */
function deduplicatePosts(posts) {
    const seen = new Set();
    return posts.filter((post) => {
        if (!post.url)
            return true; // keep posts without URLs (rare)
        const key = post.url.split("?")[0].replace(/\/+$/, "");
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=postFilter.js.map