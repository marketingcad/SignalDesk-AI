"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_proxy_1 = __importDefault(require("http-proxy"));
const nodeCron = __importStar(require("node-cron"));
const config_1 = require("./config");
const liveLogin_1 = require("./auth/liveLogin");
const cronJobs_1 = require("./scheduler/cronJobs");
const urlScheduler_1 = require("./scheduler/urlScheduler");
const crawlerManager_1 = require("./crawler/crawlerManager");
const scrapers_1 = require("./scrapers");
const backendClient_1 = require("./api/backendClient");
const discord_1 = require("./alerts/discord");
const browserAuth_1 = require("./crawler/browserAuth");
const postFilter_1 = require("./utils/postFilter");
const rateLimiter_1 = require("./utils/rateLimiter");
const sessionHealth_1 = require("./utils/sessionHealth");
const app = (0, express_1.default)();
app.use(express_1.default.json());
// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
function checkAuth(req, res) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config_1.config.backendAuthToken}`) {
        res.status(401).json({ error: "Unauthorized" });
        return false;
    }
    return true;
}
// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "signaldesk-scraper",
        running: (0, crawlerManager_1.isRunning)(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
// ---------------------------------------------------------------------------
// Manual trigger: run all platforms
// ---------------------------------------------------------------------------
app.post("/api/run", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    if ((0, crawlerManager_1.isRunning)()) {
        return res.status(409).json({ error: "A scraper run is already in progress" });
    }
    console.log("[api] Manual full run triggered");
    res.json({ message: "Scraper run started", startedAt: new Date().toISOString() });
    // Refresh keywords from /settings, then start run
    (0, backendClient_1.fetchKeywords)(true)
        .catch(() => console.warn("[api] Keyword refresh failed, using cached"))
        .then(() => (0, crawlerManager_1.runAllPlatforms)())
        .catch((err) => console.error("[api] Full run failed:", err));
});
// ---------------------------------------------------------------------------
// Manual trigger: run single platform
// ---------------------------------------------------------------------------
const VALID_PLATFORMS = ["Reddit", "X", "LinkedIn", "Facebook", "Other"];
// ---------------------------------------------------------------------------
// Helpers — platform detection & retry with backoff
// ---------------------------------------------------------------------------
function detectPlatformFromUrl(url) {
    if (/facebook\.com|fb\.com/i.test(url))
        return "Facebook";
    if (/linkedin\.com/i.test(url))
        return "LinkedIn";
    if (/reddit\.com/i.test(url))
        return "Reddit";
    if (/twitter\.com|x\.com/i.test(url))
        return "X";
    return "Other";
}
async function scrapeUrlWithRetry(url, tag) {
    const maxAttempts = config_1.config.scrapeRetryAttempts + 1;
    const baseDelay = config_1.config.scrapeRetryDelayMs;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await (0, scrapers_1.scrapeUrl)(url);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt < maxAttempts) {
                const delay = baseDelay * attempt;
                console.log(`${tag} Attempt ${attempt}/${maxAttempts} failed: ${msg} — retrying in ${(delay / 1000).toFixed(0)}s...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            else {
                throw err;
            }
        }
    }
    throw new Error("Unexpected: exhausted retries without throwing");
}
app.post("/api/run/:platform", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const platform = req.params.platform;
    if (!VALID_PLATFORMS.includes(platform)) {
        return res.status(400).json({
            error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
        });
    }
    if ((0, crawlerManager_1.isRunning)()) {
        return res.status(409).json({ error: "A scraper run is already in progress" });
    }
    console.log(`[api] Manual run triggered for ${platform}`);
    res.json({
        message: `${platform} scraper run started`,
        startedAt: new Date().toISOString(),
    });
    // Refresh keywords from /settings, then start run
    (0, backendClient_1.fetchKeywords)(true)
        .catch(() => console.warn(`[api] Keyword refresh failed for ${platform}, using cached`))
        .then(() => (0, crawlerManager_1.runPlatform)(platform))
        .catch((err) => console.error(`[api] ${platform} run failed:`, err));
});
// ---------------------------------------------------------------------------
// Scrape one or more URLs (manual paste from dashboard)
// Accepts: { url: string } OR { urls: string[] }
// ---------------------------------------------------------------------------
app.post("/api/scrape-url", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const body = req.body;
    // Normalize to array — supports both single and multi-URL
    const rawUrls = Array.isArray(body.urls) && body.urls.length > 0
        ? body.urls
        : typeof body.url === "string" && body.url.trim()
            ? [body.url.trim()]
            : [];
    if (rawUrls.length === 0) {
        return res
            .status(400)
            .json({ error: "Provide 'url' (string) or 'urls' (string array)" });
    }
    // Validate all URLs up front
    const badUrls = [];
    for (const u of rawUrls) {
        try {
            new URL(u);
        }
        catch {
            badUrls.push(u);
        }
    }
    if (badUrls.length > 0) {
        return res.status(400).json({ error: "Invalid URL format", invalid: badUrls });
    }
    console.log(`[api] Scrape URL triggered: ${rawUrls.length} URL(s)`);
    // Refresh keywords from /settings before scraping
    await (0, backendClient_1.fetchKeywords)(true).catch(() => { });
    const items = [];
    // Rate limit once per platform per batch — not per URL.
    // This prevents the 2nd+ URL of the same platform from being blocked
    // within a single "Scrape Now" request, while still protecting against
    // rapid repeated requests.
    const rateLimitedPlatforms = new Set();
    const batchCheckedPlatforms = new Set();
    for (const targetUrl of rawUrls) {
        try {
            const urlPlatform = detectPlatformFromUrl(targetUrl);
            // Only check rate limit once per platform per batch
            if (!batchCheckedPlatforms.has(urlPlatform)) {
                batchCheckedPlatforms.add(urlPlatform);
                const rateCheck = (0, rateLimiter_1.checkRateLimit)(urlPlatform);
                if (!rateCheck.allowed) {
                    rateLimitedPlatforms.add(urlPlatform);
                    const waitSec = Math.ceil(rateCheck.retryAfterMs / 1000);
                    console.log(`[api] Rate limited (${urlPlatform}) — retry in ${waitSec}s`);
                }
                else {
                    (0, rateLimiter_1.recordScrapeStart)(urlPlatform);
                }
            }
            if (rateLimitedPlatforms.has(urlPlatform)) {
                const waitSec = Math.ceil((config_1.config.platformRateLimitMs[urlPlatform] ?? 0) / 1000);
                items.push({
                    url: targetUrl,
                    success: false,
                    platform: urlPlatform,
                    postsFound: 0,
                    duration: 0,
                    errors: [`Rate limited: ${urlPlatform} scrapes must be at least ${waitSec}s apart. Try again later.`],
                    batch: null,
                    scrapedPosts: [],
                });
                continue;
            }
            const result = await scrapeUrlWithRetry(targetUrl, `[url-scraper]`);
            // Pre-filter: reject job seekers, too-short posts, and unknown authors
            const preFiltered = (0, postFilter_1.filterPosts)(result.posts, "[url-scraper]");
            const filtered = preFiltered.filter((p) => {
                if (!p.author || p.author.toLowerCase() === "unknown" || p.author.startsWith("urn:li:")) {
                    console.log(`[url-scraper] Filtered unknown/invalid author: "${p.author}" — ${p.url}`);
                    return false;
                }
                return true;
            });
            console.log(`[url-scraper] ${filtered.length} posts after filtering (${result.posts.length - filtered.length} rejected)`);
            let batchResult = null;
            if (filtered.length > 0) {
                batchResult = await (0, backendClient_1.sendLeadsBatch)(filtered);
                if (batchResult) {
                    await (0, discord_1.sendNewLeadsAlert)(targetUrl, result.platform, filtered, batchResult);
                }
            }
            const keywordsByUrl = new Map();
            for (const r of batchResult?.results ?? []) {
                if (r.url && r.matchedKeywords)
                    keywordsByUrl.set(r.url, r.matchedKeywords);
            }
            items.push({
                url: targetUrl,
                success: true,
                platform: result.platform,
                postsFound: filtered.length,
                duration: result.duration,
                errors: result.errors,
                batch: batchResult
                    ? {
                        inserted: batchResult.inserted,
                        duplicates: batchResult.duplicates,
                        results: batchResult.results,
                    }
                    : null,
                scrapedPosts: filtered.map((p) => ({
                    author: p.author,
                    text: p.text.slice(0, 200),
                    url: p.url,
                    platform: p.platform,
                    timestamp: p.timestamp,
                    matchedKeywords: keywordsByUrl.get(p.url) ?? p.matchedKeywords ?? [],
                })),
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[api] Scrape URL failed for ${targetUrl}: ${msg}`);
            items.push({
                url: targetUrl,
                success: false,
                platform: null,
                postsFound: 0,
                duration: 0,
                errors: [msg],
                batch: null,
                scrapedPosts: [],
            });
        }
    }
    res.json({
        success: true,
        totalUrls: items.length,
        totalPostsFound: items.reduce((s, i) => s + i.postsFound, 0),
        totalInserted: items.reduce((s, i) => s + (i.batch?.inserted ?? 0), 0),
        totalDuplicates: items.reduce((s, i) => s + (i.batch?.duplicates ?? 0), 0),
        items,
    });
});
// ---------------------------------------------------------------------------
// Batch scrape — single browser, multiple URLs, one combined lead submission
// Accepts: { urls: string[], source?: string }
// ---------------------------------------------------------------------------
app.post("/api/scrape-url/batch", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const body = req.body;
    const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string" && u.trim()) : [];
    if (urls.length === 0) {
        return res.status(400).json({ error: "Provide 'urls' (non-empty string array)" });
    }
    // Validate all URLs
    const badUrls = [];
    for (const u of urls) {
        try {
            new URL(u);
        }
        catch {
            badUrls.push(u);
        }
    }
    if (badUrls.length > 0) {
        return res.status(400).json({ error: "Invalid URL format", invalid: badUrls });
    }
    const sourceName = typeof body.source === "string" ? body.source.trim() : undefined;
    console.log(`[api] Batch scrape triggered: ${urls.length} URL(s)${sourceName ? ` (source: ${sourceName})` : ""}`);
    // Refresh keywords before scraping
    await (0, backendClient_1.fetchKeywords)(true).catch(() => { });
    // Scrape all URLs with single browser
    const batchResult = await (0, scrapers_1.scrapeUrlsBatch)(urls, sourceName);
    // Filter posts (remove job seekers, unknown authors, short posts)
    const filtered = (0, postFilter_1.filterPosts)(batchResult.posts, "[batch-scraper]").filter((p) => {
        if (!p.author || p.author.toLowerCase() === "unknown" || p.author.startsWith("urn:li:"))
            return false;
        return true;
    });
    console.log(`[api] Batch: ${filtered.length} posts after filtering (${batchResult.posts.length - filtered.length} rejected)`);
    // Send ONE combined batch to the backend
    let leadsBatchResult = null;
    if (filtered.length > 0) {
        leadsBatchResult = await (0, backendClient_1.sendLeadsBatch)(filtered);
        if (leadsBatchResult) {
            // Send alert for the whole batch
            const firstPlatform = batchResult.urlResults.find((r) => r.success)?.platform || "Other";
            await (0, discord_1.sendNewLeadsAlert)(`Batch (${urls.length} URLs)`, firstPlatform, filtered, leadsBatchResult);
        }
    }
    // Build per-URL keyword mapping from batch results
    const kwMap = new Map();
    for (const r of leadsBatchResult?.results ?? []) {
        if (r.url && r.matchedKeywords)
            kwMap.set(r.url, r.matchedKeywords);
    }
    res.json({
        success: true,
        totalUrls: batchResult.totalUrls,
        successUrls: batchResult.successCount,
        failedUrls: batchResult.failedCount,
        retriedUrls: batchResult.retriedCount,
        totalPostsFound: filtered.length,
        totalInserted: leadsBatchResult?.inserted ?? 0,
        totalDuplicates: leadsBatchResult?.duplicates ?? 0,
        duration: batchResult.duration,
        urlResults: batchResult.urlResults,
        scrapedPosts: filtered.slice(0, 100).map((p) => ({
            author: p.author,
            text: p.text.slice(0, 200),
            url: p.url,
            platform: p.platform,
            timestamp: p.timestamp,
            matchedKeywords: kwMap.get(p.url) ?? p.matchedKeywords ?? [],
        })),
    });
});
// ---------------------------------------------------------------------------
// URL Schedules — APify-style custom per-URL scheduler
// ---------------------------------------------------------------------------
/** GET /api/schedules — list all */
app.get("/api/schedules", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedules = await (0, urlScheduler_1.listSchedules)();
    res.json({ success: true, count: schedules.length, schedules });
});
/** GET /api/schedules/runs — all run history (must be before :id) */
app.get("/api/schedules/runs", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const runs = await (0, urlScheduler_1.listRuns)();
    res.json({ success: true, runs });
});
/** DELETE /api/schedules/runs — clear all run history */
app.delete("/api/schedules/runs", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    await (0, urlScheduler_1.clearRuns)();
    res.json({ success: true });
});
/** GET /api/schedules/:id — get one */
app.get("/api/schedules/:id", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = await (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule });
});
/** POST /api/schedules — create */
app.post("/api/schedules", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const { name, url, cron, status } = req.body;
    if (!name || !name.trim())
        return res.status(400).json({ error: "Field 'name' is required" });
    if (!url)
        return res.status(400).json({ error: "Field 'url' is required" });
    try {
        new URL(url);
    }
    catch {
        return res.status(400).json({ error: "Invalid URL format" });
    }
    if (!cron || !nodeCron.validate(cron))
        return res.status(400).json({ error: "'cron' is required and must be a valid cron expression" });
    if (status && status !== "active" && status !== "paused")
        return res.status(400).json({ error: "'status' must be 'active' or 'paused'" });
    const schedule = await (0, urlScheduler_1.createSchedule)({
        name: name.trim(),
        url: url.trim(),
        cron: cron.trim(),
        status: status ?? "active",
    });
    console.log(`[api] Schedule created: "${schedule.name}" (${schedule.cron})`);
    res.status(201).json({ success: true, schedule });
});
/** PATCH /api/schedules/:id — partial update */
app.patch("/api/schedules/:id", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const { name, url, cron, status } = req.body;
    if (url !== undefined) {
        try {
            new URL(url);
        }
        catch {
            return res.status(400).json({ error: "Invalid URL format" });
        }
    }
    if (cron !== undefined && !nodeCron.validate(cron))
        return res.status(400).json({ error: "Invalid cron expression" });
    if (status !== undefined && status !== "active" && status !== "paused")
        return res.status(400).json({ error: "'status' must be 'active' or 'paused'" });
    const updated = await (0, urlScheduler_1.updateSchedule)(req.params.id, {
        ...(name !== undefined && { name: name.trim() }),
        ...(url !== undefined && { url: url.trim() }),
        ...(cron !== undefined && { cron: cron.trim() }),
        ...(status !== undefined && { status: status }),
    });
    if (!updated)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule: updated });
});
/** DELETE /api/schedules/:id */
app.delete("/api/schedules/:id", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const deleted = await (0, urlScheduler_1.deleteSchedule)(req.params.id);
    if (!deleted)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, deleted: true, id: req.params.id });
});
/** GET /api/schedules/:id/runs — run history for one schedule */
app.get("/api/schedules/:id/runs", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = await (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    const runs = await (0, urlScheduler_1.listRuns)(req.params.id);
    res.json({ success: true, runs });
});
/** POST /api/schedules/:id/pause */
app.post("/api/schedules/:id/pause", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = await (0, urlScheduler_1.pauseSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule });
});
/** POST /api/schedules/:id/resume */
app.post("/api/schedules/:id/resume", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = await (0, urlScheduler_1.resumeSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule });
});
/** POST /api/schedules/:id/run — trigger immediate run (single URL) */
app.post("/api/schedules/:id/run", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = await (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    console.log(`[api] Manual trigger for schedule "${schedule.name}"`);
    try {
        await (0, urlScheduler_1.runScheduleNow)(req.params.id);
        res.json({ success: true, schedule: await (0, urlScheduler_1.getSchedule)(req.params.id) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
    }
});
/** POST /api/schedules/:id/run-group — trigger all URLs in a schedule group sequentially */
app.post("/api/schedules/:id/run-group", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = await (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    console.log(`[api] Manual group trigger from schedule "${schedule.name}"`);
    try {
        await (0, urlScheduler_1.runGroupNow)(req.params.id);
        res.json({ success: true, schedule: await (0, urlScheduler_1.getSchedule)(req.params.id) });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
    }
});
// ---------------------------------------------------------------------------
// Browser login setup — saves cookies for authenticated scraping
// ---------------------------------------------------------------------------
app.post("/api/auth/setup", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    console.log("[api] Browser login setup triggered");
    res.json({ message: "Browser opening — log in to your accounts then close the browser window" });
    (0, browserAuth_1.loginAndSave)().catch((err) => console.error("[api] Browser login failed:", err));
});
app.get("/api/auth/status", (_req, res) => {
    res.json({ cookiesSaved: (0, browserAuth_1.hasSavedCookies)() });
});
// ---------------------------------------------------------------------------
// Auth health — session health status + on-demand cookie validation
// ---------------------------------------------------------------------------
/** GET /api/auth/health — current session health for all platforms */
app.get("/api/auth/health", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const health = (0, sessionHealth_1.getAllHealth)();
    const hasExpired = health.some((h) => h.status === "expired");
    const hasWarning = health.some((h) => h.status === "warning");
    res.json({
        overall: hasExpired ? "expired" : hasWarning ? "warning" : "healthy",
        platforms: health,
        cookiesSaved: (0, browserAuth_1.hasSavedCookies)(),
    });
});
/** POST /api/auth/validate — trigger on-demand cookie validation for a platform */
app.post("/api/auth/validate", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const { platform } = req.body;
    const validPlatforms = ["facebook", "linkedin"];
    if (platform && !validPlatforms.includes(platform.toLowerCase())) {
        return res.status(400).json({
            error: `Invalid platform. Must be one of: ${validPlatforms.join(", ")}`,
        });
    }
    console.log(`[api] Cookie validation triggered${platform ? ` for ${platform}` : " for all platforms"}`);
    const platformMap = { facebook: "Facebook", linkedin: "LinkedIn" };
    if (platform) {
        const result = await (0, browserAuth_1.validateCookies)(platform.toLowerCase());
        const platformKey = platformMap[platform.toLowerCase()];
        if (!platformKey)
            return res.status(400).json({ error: "Invalid platform" });
        if (result !== "error") {
            (0, sessionHealth_1.reportValidationResult)(platformKey, result);
        }
        res.json({ success: true, platform, result });
    }
    else {
        const results = await (0, browserAuth_1.validateAllCookies)();
        for (const [key, result] of Object.entries(results)) {
            const p = platformMap[key];
            if (!p || result === "error")
                continue;
            (0, sessionHealth_1.reportValidationResult)(p, result);
        }
        res.json({ success: true, results });
    }
});
/** POST /api/auth/health/reset — reset health tracking after re-login */
app.post("/api/auth/health/reset", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const { platform } = req.body;
    const platformMap = {
        facebook: "Facebook",
        linkedin: "LinkedIn",
        reddit: "Reddit",
        x: "X",
    };
    if (platform) {
        const p = platformMap[platform.toLowerCase()];
        if (!p)
            return res.status(400).json({ error: "Invalid platform" });
        (0, sessionHealth_1.resetHealth)(p);
        console.log(`[api] Health state reset for ${p}`);
        res.json({ success: true, reset: p });
    }
    else {
        Object.values(platformMap).forEach(sessionHealth_1.resetHealth);
        console.log("[api] Health state reset for all platforms");
        res.json({ success: true, reset: "all" });
    }
});
// ---------------------------------------------------------------------------
// Status endpoint
// ---------------------------------------------------------------------------
app.get("/api/status", async (_req, res) => {
    const schedules = await (0, urlScheduler_1.listSchedules)();
    res.json({
        running: (0, crawlerManager_1.isRunning)(),
        targets: {
            reddit: config_1.config.targets.redditSubreddits,
            x: config_1.config.targets.xSearchQueries,
            linkedin: config_1.config.targets.linkedinSearchQueries,
            facebook: config_1.config.targets.facebookGroupUrls,
        },
        schedule: config_1.config.cron,
        maxResultsPerRun: config_1.config.maxResultsPerRun,
        urlSchedules: schedules.length,
    });
});
// ---------------------------------------------------------------------------
// Test Discord notification — sends mock Facebook leads alert
// ---------------------------------------------------------------------------
app.post("/api/test/discord", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const mockPosts = [
        {
            platform: "Facebook",
            author: "Jane Smith",
            text: "Hey does anyone know a reliable virtual assistant for my e-commerce store? Need someone who can handle customer emails, order tracking, and basic social media. Budget is flexible for the right person.",
            url: "https://www.facebook.com/groups/sample/posts/test001",
            timestamp: new Date().toISOString(),
            engagement: 12,
            source: "facebook-group-test",
        },
        {
            platform: "Facebook",
            author: "Mark Rivera",
            text: "Looking to hire a VA to help me manage my Shopify store and respond to customer messages. Must be fluent in English and available during US hours. DM if interested!",
            url: "https://www.facebook.com/groups/sample/posts/test002",
            timestamp: new Date().toISOString(),
            engagement: 8,
            source: "facebook-group-test",
        },
        {
            platform: "Facebook",
            author: "Sarah Chen",
            text: "Anyone recommend a virtual assistant service for a small business owner? I need help with scheduling, emails, and some data entry. Happy to pay fair rates.",
            url: "https://www.facebook.com/groups/sample/posts/test003",
            timestamp: new Date().toISOString(),
            engagement: 5,
            source: "facebook-group-test",
        },
    ];
    const mockBatch = {
        success: true,
        processed: 3,
        inserted: 3,
        duplicates: 0,
        results: [
            {
                url: mockPosts[0].url,
                leadId: "mock-lead-001",
                intentScore: 91,
                intentLevel: "High",
                matchedKeywords: ["virtual assistant", "e-commerce", "customer emails"],
                duplicate: false,
            },
            {
                url: mockPosts[1].url,
                leadId: "mock-lead-002",
                intentScore: 85,
                intentLevel: "High",
                matchedKeywords: ["hire a VA", "Shopify", "customer messages"],
                duplicate: false,
            },
            {
                url: mockPosts[2].url,
                leadId: "mock-lead-003",
                intentScore: 78,
                intentLevel: "Medium",
                matchedKeywords: ["virtual assistant", "small business"],
                duplicate: false,
            },
        ],
    };
    try {
        await (0, discord_1.sendNewLeadsAlert)("https://www.facebook.com/groups/sample-va-group", "Facebook", mockPosts, mockBatch);
        console.log("[api] Test Discord notification sent");
        res.json({ success: true, message: "Test Discord notification sent", leads: mockPosts.length });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[api] Test Discord notification failed:", msg);
        res.status(500).json({ error: msg });
    }
});
// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Live Login — remote viewable browser for interactive social login
// ---------------------------------------------------------------------------
/** GET /api/auth/live/status — is a login session active? */
app.get("/api/auth/live/status", (req, res) => {
    if (!checkAuth(req, res))
        return;
    res.json((0, liveLogin_1.getLiveStatus)());
});
/** POST /api/auth/live/start — boot the remote browser; returns viewer path. */
app.post("/api/auth/live/start", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const { platform } = req.body;
    try {
        const { viewToken, platform: p, expiresAt } = await (0, liveLogin_1.startLiveLogin)(platform || "facebook");
        // The outer token gates the noVNC HTML fetch; the token embedded in `path`
        // gates the WebSocket upgrade (noVNC forwards the path verbatim).
        const wsPath = encodeURIComponent(`vnc/websockify?token=${viewToken}`);
        const viewerPath = `/vnc/vnc.html?autoconnect=true&resize=remote&path=${wsPath}&token=${viewToken}`;
        res.json({ ok: true, platform: p, expiresAt, viewToken, viewerPath });
    }
    catch (err) {
        res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
/** POST /api/auth/live/save — persist cookies, tear the browser down. */
app.post("/api/auth/live/save", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    try {
        const result = await (0, liveLogin_1.saveLiveLogin)();
        res.json({ ok: true, ...result });
    }
    catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
/** POST /api/auth/live/cancel — tear down without saving. */
app.post("/api/auth/live/cancel", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    await (0, liveLogin_1.cancelLiveLogin)();
    res.json({ ok: true });
});
// noVNC stream proxy. Reachable only with a valid one-time view token; the
// websockify/x11vnc backends bind to localhost, so this is the only way in.
const vncProxy = http_proxy_1.default.createProxyServer({
    target: `http://127.0.0.1:${liveLogin_1.WEBSOCKIFY_PORT}`,
    ws: true,
});
// Fail fast instead of hanging when websockify isn't running (no session).
vncProxy.on("error", (err, _req, res) => {
    console.error("[vnc-proxy]", err.message);
    const r = res;
    if (r && !r.headersSent) {
        r.writeHead(503, { "Content-Type": "text/plain" });
        r.end("Live Login session is not active. Start it from Settings and try again.");
    }
    else if (r) {
        r.end();
    }
});
// app.use("/vnc", …) strips the "/vnc" prefix from req.url, so requests reach
// websockify at the path it expects (/vnc.html, /websockify, static assets).
//
// Only the static noVNC client (public open-source JS/CSS) is served here — it
// carries no screen data, so it is intentionally ungated (its sub-resource
// requests can't forward the token query anyway). The ACTUAL screen stream is
// the WebSocket, which is strictly token-gated in the `upgrade` handler below.
app.use("/vnc", (req, res) => {
    // No active session → websockify is down; return a readable error instead of
    // proxying into a connection-refused hang (the old "loading forever" bug).
    if (!(0, liveLogin_1.getLiveStatus)().active) {
        res.status(503).send("Live Login session is not active. Start it from Settings and try again.");
        return;
    }
    vncProxy.web(req, res);
});
const server = app.listen(config_1.config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║        SignalDesk AI — Scraper Service           ║
║        Playwright + Crawlee + node-cron          ║
╚══════════════════════════════════════════════════╝

  Server:    http://localhost:${config_1.config.port}
  Health:    http://localhost:${config_1.config.port}/health
  Status:    http://localhost:${config_1.config.port}/api/status
  Schedules: http://localhost:${config_1.config.port}/api/schedules
  Backend:   ${config_1.config.backendApiUrl}
  Headless:  ${config_1.config.headless}
  `);
    // Restore the durable login session (Supabase → rolling file) before scrapers
    // run, so a fresh container picks up the latest cookies without a manual paste.
    (0, browserAuth_1.initSession)()
        .then(() => console.log(`  Auth:      session ${(0, browserAuth_1.hasSavedCookies)() ? "loaded" : "not found — login required"}`))
        .catch((err) => console.warn("  Auth:      session init failed:", err));
    // Fetch user-configured keywords from /settings page before starting scrapers
    (0, backendClient_1.fetchKeywords)().then((kw) => {
        if (kw) {
            console.log(`  Keywords: ${kw.searchQueries.length} search queries loaded from /settings`);
        }
        else {
            console.log("  Keywords: using env var defaults (backend unreachable or empty)");
        }
    }).catch(() => {
        console.log("  Keywords: using env var defaults (fetch failed)");
    });
    (0, cronJobs_1.startScheduler)();
    (0, urlScheduler_1.initUrlScheduler)().catch((err) => console.error("[server] Failed to init URL scheduler:", err));
});
// Bridge the noVNC WebSocket upgrade to websockify. Gated by the same one-time
// view token (carried in the query, which noVNC forwards via its `path` param).
server.on("upgrade", (req, socket, head) => {
    try {
        const url = new URL(req.url || "", "http://localhost");
        if (!url.pathname.startsWith("/vnc/") || !(0, liveLogin_1.verifyViewToken)(url.searchParams.get("token"))) {
            socket.destroy();
            return;
        }
        req.url = url.pathname.replace(/^\/vnc/, "") + url.search; // strip prefix
        vncProxy.ws(req, socket, head);
    }
    catch {
        socket.destroy();
    }
});
// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[server] Shutting down...");
    (0, cronJobs_1.stopScheduler)();
    (0, urlScheduler_1.shutdownUrlScheduler)();
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("\n[server] Shutting down...");
    (0, cronJobs_1.stopScheduler)();
    (0, urlScheduler_1.shutdownUrlScheduler)();
    process.exit(0);
});
//# sourceMappingURL=index.js.map