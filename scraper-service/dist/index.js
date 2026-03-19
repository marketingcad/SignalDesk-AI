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
const nodeCron = __importStar(require("node-cron"));
const config_1 = require("./config");
const cronJobs_1 = require("./scheduler/cronJobs");
const urlScheduler_1 = require("./scheduler/urlScheduler");
const crawlerManager_1 = require("./crawler/crawlerManager");
const scrapers_1 = require("./scrapers");
const backendClient_1 = require("./api/backendClient");
const discord_1 = require("./alerts/discord");
const browserAuth_1 = require("./crawler/browserAuth");
const postFilter_1 = require("./utils/postFilter");
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
    (0, crawlerManager_1.runAllPlatforms)().catch((err) => console.error("[api] Full run failed:", err));
});
// ---------------------------------------------------------------------------
// Manual trigger: run single platform
// ---------------------------------------------------------------------------
const VALID_PLATFORMS = ["Reddit", "X", "LinkedIn", "Facebook", "Other"];
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
    (0, crawlerManager_1.runPlatform)(platform).catch((err) => console.error(`[api] ${platform} run failed:`, err));
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
    const items = [];
    for (const targetUrl of rawUrls) {
        try {
            const result = await (0, scrapers_1.scrapeUrl)(targetUrl);
            const discordErrors = result.errors.filter((e) => !e.includes("requires login") && !e.includes("page.goto: Timeout"));
            if (discordErrors.length > 0) {
                await (0, discord_1.sendErrorAlert)(result.platform, discordErrors.join("\n"));
            }
            // Pre-filter: reject job seekers and too-short posts (same as crawlerManager)
            const filtered = (0, postFilter_1.filterPosts)(result.posts, "[url-scraper]");
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
                    matchedKeywords: keywordsByUrl.get(p.url) ?? [],
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
// URL Schedules — APify-style custom per-URL scheduler
// ---------------------------------------------------------------------------
/** GET /api/schedules — list all */
app.get("/api/schedules", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedules = (0, urlScheduler_1.listSchedules)();
    res.json({ success: true, count: schedules.length, schedules });
});
/** GET /api/schedules/runs — all run history (must be before :id) */
app.get("/api/schedules/runs", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const runs = (0, urlScheduler_1.listRuns)();
    res.json({ success: true, runs });
});
/** DELETE /api/schedules/runs — clear all run history */
app.delete("/api/schedules/runs", (req, res) => {
    if (!checkAuth(req, res))
        return;
    (0, urlScheduler_1.clearRuns)();
    res.json({ success: true });
});
/** GET /api/schedules/:id — get one */
app.get("/api/schedules/:id", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule });
});
/** POST /api/schedules — create */
app.post("/api/schedules", (req, res) => {
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
    const schedule = (0, urlScheduler_1.createSchedule)({
        name: name.trim(),
        url: url.trim(),
        cron: cron.trim(),
        status: status ?? "active",
    });
    console.log(`[api] Schedule created: "${schedule.name}" (${schedule.cron})`);
    res.status(201).json({ success: true, schedule });
});
/** PATCH /api/schedules/:id — partial update */
app.patch("/api/schedules/:id", (req, res) => {
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
    const updated = (0, urlScheduler_1.updateSchedule)(req.params.id, {
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
app.delete("/api/schedules/:id", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const deleted = (0, urlScheduler_1.deleteSchedule)(req.params.id);
    if (!deleted)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, deleted: true, id: req.params.id });
});
/** GET /api/schedules/:id/runs — run history for one schedule */
app.get("/api/schedules/:id/runs", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    const runs = (0, urlScheduler_1.listRuns)(req.params.id);
    res.json({ success: true, runs });
});
/** POST /api/schedules/:id/pause */
app.post("/api/schedules/:id/pause", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = (0, urlScheduler_1.pauseSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule });
});
/** POST /api/schedules/:id/resume */
app.post("/api/schedules/:id/resume", (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = (0, urlScheduler_1.resumeSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true, schedule });
});
/** POST /api/schedules/:id/run — trigger immediate run */
app.post("/api/schedules/:id/run", async (req, res) => {
    if (!checkAuth(req, res))
        return;
    const schedule = (0, urlScheduler_1.getSchedule)(req.params.id);
    if (!schedule)
        return res.status(404).json({ error: "Schedule not found" });
    console.log(`[api] Manual trigger for schedule "${schedule.name}"`);
    try {
        await (0, urlScheduler_1.runScheduleNow)(req.params.id);
        res.json({ success: true, schedule: (0, urlScheduler_1.getSchedule)(req.params.id) });
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
// Status endpoint
// ---------------------------------------------------------------------------
app.get("/api/status", (_req, res) => {
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
        urlSchedules: (0, urlScheduler_1.listSchedules)().length,
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
                intentScore: 0.91,
                intentLevel: "High",
                matchedKeywords: ["virtual assistant", "e-commerce", "customer emails"],
                duplicate: false,
            },
            {
                url: mockPosts[1].url,
                leadId: "mock-lead-002",
                intentScore: 0.85,
                intentLevel: "High",
                matchedKeywords: ["hire a VA", "Shopify", "customer messages"],
                duplicate: false,
            },
            {
                url: mockPosts[2].url,
                leadId: "mock-lead-003",
                intentScore: 0.78,
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
app.listen(config_1.config.port, () => {
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
    (0, cronJobs_1.startScheduler)();
    (0, urlScheduler_1.initUrlScheduler)();
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