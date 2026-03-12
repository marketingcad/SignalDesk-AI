"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunning = isRunning;
exports.runPlatform = runPlatform;
exports.runAllPlatforms = runAllPlatforms;
const scrapers_1 = require("../scrapers");
const backendClient_1 = require("../api/backendClient");
const discord_1 = require("../alerts/discord");
// ---------------------------------------------------------------------------
// Pre-filter: reject obvious job seekers and self-promotion before sending
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
];
function isJobSeeker(text) {
    return REJECT_PATTERNS.some((pattern) => pattern.test(text));
}
function filterPosts(posts) {
    return posts.filter((post) => {
        if (!post.text || post.text.trim().length < 20)
            return false;
        if (isJobSeeker(post.text)) {
            console.log(`[crawler] Filtered job seeker: "${post.text.slice(0, 80)}..."`);
            return false;
        }
        return true;
    });
}
const SCRAPERS = {
    Reddit: scrapers_1.scrapeReddit,
    X: scrapers_1.scrapeX,
    LinkedIn: scrapers_1.scrapeLinkedin,
    Facebook: scrapers_1.scrapeFacebook,
};
let runInProgress = false;
function isRunning() {
    return runInProgress;
}
async function runPlatform(platform) {
    const scraper = SCRAPERS[platform];
    if (!scraper)
        throw new Error(`Unknown platform: ${platform}`);
    console.log(`\n[crawler] ========== ${platform} scrape started ==========`);
    const result = await scraper();
    console.log(`[crawler] ${platform}: ${result.posts.length} raw posts in ${(result.duration / 1000).toFixed(1)}s`);
    // Pre-filter
    const filtered = filterPosts(result.posts);
    console.log(`[crawler] ${platform}: ${filtered.length} posts after filtering (${result.posts.length - filtered.length} rejected)`);
    // Send to backend
    if (filtered.length > 0) {
        const response = await (0, backendClient_1.sendLeadsBatch)(filtered);
        if (response) {
            console.log(`[crawler] ${platform}: ${response.inserted} new leads, ${response.duplicates} duplicates`);
            await (0, discord_1.sendNewLeadsAlert)(`scheduled:${platform}`, platform, filtered, response);
        }
    }
    if (result.errors.length > 0) {
        console.warn(`[crawler] ${platform}: ${result.errors.length} errors`);
        await (0, discord_1.sendErrorAlert)(platform, result.errors.join("\n"));
    }
    return { ...result, posts: filtered };
}
// ---------------------------------------------------------------------------
// Run all platforms
// ---------------------------------------------------------------------------
async function runAllPlatforms() {
    if (runInProgress) {
        console.warn("[crawler] Run already in progress — skipping");
        return [];
    }
    runInProgress = true;
    const results = [];
    console.log("\n[crawler] ╔══════════════════════════════════════════╗");
    console.log("[crawler] ║      STARTING FULL SCRAPER RUN           ║");
    console.log("[crawler] ╚══════════════════════════════════════════╝\n");
    const platforms = ["Reddit", "X", "LinkedIn", "Facebook"];
    for (const platform of platforms) {
        try {
            const result = await runPlatform(platform);
            results.push(result);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[crawler] ${platform} FAILED: ${msg}`);
            results.push({
                platform,
                posts: [],
                duration: 0,
                errors: [msg],
            });
            await (0, discord_1.sendErrorAlert)(platform, msg);
        }
        // Pause between platforms to avoid detection
        console.log("[crawler] Pausing 5s between platforms...");
        await new Promise((r) => setTimeout(r, 5000));
    }
    // Summary
    const totalPosts = results.reduce((s, r) => s + r.posts.length, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    console.log(`\n[crawler] ══════════ RUN COMPLETE ══════════`);
    console.log(`[crawler] Total: ${totalPosts} posts, ${totalErrors} errors`);
    await (0, discord_1.sendRunSummary)(results);
    runInProgress = false;
    return results;
}
//# sourceMappingURL=crawlerManager.js.map