"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const cronJobs_1 = require("./scheduler/cronJobs");
const crawlerManager_1 = require("./crawler/crawlerManager");
const scrapers_1 = require("./scrapers");
const backendClient_1 = require("./api/backendClient");
const discord_1 = require("./alerts/discord");
const browserAuth_1 = require("./crawler/browserAuth");
const app = (0, express_1.default)();
app.use(express_1.default.json());
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
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config_1.config.backendAuthToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if ((0, crawlerManager_1.isRunning)()) {
        return res.status(409).json({ error: "A scraper run is already in progress" });
    }
    console.log("[api] Manual full run triggered");
    res.json({ message: "Scraper run started", startedAt: new Date().toISOString() });
    // Run in background (don't block the response)
    (0, crawlerManager_1.runAllPlatforms)().catch((err) => console.error("[api] Full run failed:", err));
});
// ---------------------------------------------------------------------------
// Manual trigger: run single platform
// ---------------------------------------------------------------------------
const VALID_PLATFORMS = ["Reddit", "X", "LinkedIn", "Facebook"];
app.post("/api/run/:platform", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config_1.config.backendAuthToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
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
// Scrape a specific URL (manual paste from dashboard)
// ---------------------------------------------------------------------------
app.post("/api/scrape-url", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config_1.config.backendAuthToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const { url } = req.body;
    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Missing 'url' in request body" });
    }
    try {
        new URL(url);
    }
    catch {
        return res.status(400).json({ error: "Invalid URL format" });
    }
    console.log(`[api] Scrape URL triggered: ${url}`);
    try {
        const result = await (0, scrapers_1.scrapeUrl)(url);
        if (result.errors.length > 0) {
            await (0, discord_1.sendErrorAlert)(result.platform, result.errors.join("\n"));
        }
        // Send scraped posts to backend for AI qualification
        let batchResult = null;
        if (result.posts.length > 0) {
            batchResult = await (0, backendClient_1.sendLeadsBatch)(result.posts);
        }
        res.json({
            success: true,
            platform: result.platform,
            postsFound: result.posts.length,
            duration: result.duration,
            errors: result.errors,
            batch: batchResult
                ? { inserted: batchResult.inserted, duplicates: batchResult.duplicates }
                : null,
            scrapedPosts: result.posts.map((p) => ({
                author: p.author,
                text: p.text.slice(0, 200),
                url: p.url,
                platform: p.platform,
            })),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[api] Scrape URL failed: ${msg}`);
        res.status(500).json({ error: msg });
    }
});
// ---------------------------------------------------------------------------
// Browser login setup — saves cookies for authenticated scraping
// ---------------------------------------------------------------------------
app.post("/api/auth/setup", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config_1.config.backendAuthToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
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
    });
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

  Server:   http://localhost:${config_1.config.port}
  Health:   http://localhost:${config_1.config.port}/health
  Status:   http://localhost:${config_1.config.port}/api/status
  Backend:  ${config_1.config.backendApiUrl}
  Headless: ${config_1.config.headless}
  `);
    (0, cronJobs_1.startScheduler)();
});
// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[server] Shutting down...");
    (0, cronJobs_1.stopScheduler)();
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("\n[server] Shutting down...");
    (0, cronJobs_1.stopScheduler)();
    process.exit(0);
});
//# sourceMappingURL=index.js.map