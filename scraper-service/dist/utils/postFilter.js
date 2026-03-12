"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isJobSeeker = isJobSeeker;
exports.filterPosts = filterPosts;
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
    return REJECT_PATTERNS.some((pattern) => pattern.test(text));
}
/**
 * Filter scraped posts: remove too-short posts and job seekers.
 * @param tag - log prefix for context (e.g. "[crawler]" or "[url-scraper]")
 */
function filterPosts(posts, tag = "[filter]") {
    return posts.filter((post) => {
        if (!post.text || post.text.trim().length < 20)
            return false;
        if (isJobSeeker(post.text)) {
            console.log(`${tag} Filtered job seeker: "${post.text.slice(0, 80)}..."`);
            return false;
        }
        return true;
    });
}
//# sourceMappingURL=postFilter.js.map