import express from "express";
import { config } from "./config";
import { startScheduler, stopScheduler } from "./scheduler/cronJobs";
import {
  runAllPlatforms,
  runPlatform,
  isRunning,
} from "./crawler/crawlerManager";
import { scrapeUrl } from "./scrapers";
import { sendLeadsBatch } from "./api/backendClient";
import { sendErrorAlert } from "./alerts/discord";
import { loginAndSave, hasSavedCookies } from "./crawler/browserAuth";
import type { Platform } from "./types";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "signaldesk-scraper",
    running: isRunning(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Manual trigger: run all platforms
// ---------------------------------------------------------------------------

app.post("/api/run", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.backendAuthToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (isRunning()) {
    return res.status(409).json({ error: "A scraper run is already in progress" });
  }

  console.log("[api] Manual full run triggered");
  res.json({ message: "Scraper run started", startedAt: new Date().toISOString() });

  // Run in background (don't block the response)
  runAllPlatforms().catch((err) =>
    console.error("[api] Full run failed:", err)
  );
});

// ---------------------------------------------------------------------------
// Manual trigger: run single platform
// ---------------------------------------------------------------------------

const VALID_PLATFORMS: Platform[] = ["Reddit", "X", "LinkedIn", "Facebook"];

app.post("/api/run/:platform", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.backendAuthToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const platform = req.params.platform as Platform;
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
    });
  }

  if (isRunning()) {
    return res.status(409).json({ error: "A scraper run is already in progress" });
  }

  console.log(`[api] Manual run triggered for ${platform}`);
  res.json({
    message: `${platform} scraper run started`,
    startedAt: new Date().toISOString(),
  });

  runPlatform(platform).catch((err) =>
    console.error(`[api] ${platform} run failed:`, err)
  );
});

// ---------------------------------------------------------------------------
// Scrape a specific URL (manual paste from dashboard)
// ---------------------------------------------------------------------------

app.post("/api/scrape-url", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.backendAuthToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing 'url' in request body" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  console.log(`[api] Scrape URL triggered: ${url}`);

  try {
    const result = await scrapeUrl(url);

    if (result.errors.length > 0) {
      await sendErrorAlert(result.platform, result.errors.join("\n"));
    }

    // Send scraped posts to backend for AI qualification
    let batchResult = null;
    if (result.posts.length > 0) {
      batchResult = await sendLeadsBatch(result.posts);
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
  } catch (err) {
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
  if (!auth || auth !== `Bearer ${config.backendAuthToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("[api] Browser login setup triggered");
  res.json({ message: "Browser opening — log in to your accounts then close the browser window" });

  loginAndSave().catch((err) =>
    console.error("[api] Browser login failed:", err)
  );
});

app.get("/api/auth/status", (_req, res) => {
  res.json({ cookiesSaved: hasSavedCookies() });
});

// ---------------------------------------------------------------------------
// Status endpoint
// ---------------------------------------------------------------------------

app.get("/api/status", (_req, res) => {
  res.json({
    running: isRunning(),
    targets: {
      reddit: config.targets.redditSubreddits,
      x: config.targets.xSearchQueries,
      linkedin: config.targets.linkedinSearchQueries,
      facebook: config.targets.facebookGroupUrls,
    },
    schedule: config.cron,
    maxResultsPerRun: config.maxResultsPerRun,
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║        SignalDesk AI — Scraper Service           ║
║        Playwright + Crawlee + node-cron          ║
╚══════════════════════════════════════════════════╝

  Server:   http://localhost:${config.port}
  Health:   http://localhost:${config.port}/health
  Status:   http://localhost:${config.port}/api/status
  Backend:  ${config.backendApiUrl}
  Headless: ${config.headless}
  `);

  startScheduler();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[server] Shutting down...");
  stopScheduler();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[server] Shutting down...");
  stopScheduler();
  process.exit(0);
});
