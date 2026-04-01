import express from "express";
import * as nodeCron from "node-cron";
import { config } from "./config";
import { startScheduler, stopScheduler } from "./scheduler/cronJobs";
import {
  initUrlScheduler,
  shutdownUrlScheduler,
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  runScheduleNow,
  listRuns,
  clearRuns,
  runGroupNow,
} from "./scheduler/urlScheduler";
import {
  runAllPlatforms,
  runPlatform,
  isRunning,
} from "./crawler/crawlerManager";
import { scrapeUrl } from "./scrapers";
import { sendLeadsBatch, fetchKeywords } from "./api/backendClient";
import { sendErrorAlert, sendNewLeadsAlert } from "./alerts/discord";
import { loginAndSave, hasSavedCookies } from "./crawler/browserAuth";
import { filterPosts } from "./utils/postFilter";
import { checkRateLimit, recordScrapeStart } from "./utils/rateLimiter";
import type { Platform, UrlScrapeItemResult } from "./types";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function checkAuth(req: express.Request, res: express.Response): boolean {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.backendAuthToken}`) {
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
    running: isRunning(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Manual trigger: run all platforms
// ---------------------------------------------------------------------------

app.post("/api/run", async (req, res) => {
  if (!checkAuth(req, res)) return;

  if (isRunning()) {
    return res.status(409).json({ error: "A scraper run is already in progress" });
  }

  console.log("[api] Manual full run triggered");
  res.json({ message: "Scraper run started", startedAt: new Date().toISOString() });

  // Refresh keywords from /settings, then start run
  fetchKeywords(true)
    .catch(() => console.warn("[api] Keyword refresh failed, using cached"))
    .then(() => runAllPlatforms())
    .catch((err) => console.error("[api] Full run failed:", err));
});

// ---------------------------------------------------------------------------
// Manual trigger: run single platform
// ---------------------------------------------------------------------------

const VALID_PLATFORMS: Platform[] = ["Reddit", "X", "LinkedIn", "Facebook", "Other"];

// ---------------------------------------------------------------------------
// Helpers — platform detection & retry with backoff
// ---------------------------------------------------------------------------

function detectPlatformFromUrl(url: string): Platform {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/twitter\.com|x\.com/i.test(url)) return "X";
  return "Other";
}

async function scrapeUrlWithRetry(url: string, tag: string) {
  const maxAttempts = config.scrapeRetryAttempts + 1;
  const baseDelay = config.scrapeRetryDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scrapeUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = baseDelay * attempt;
        console.log(`${tag} Attempt ${attempt}/${maxAttempts} failed: ${msg} — retrying in ${(delay / 1000).toFixed(0)}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Unexpected: exhausted retries without throwing");
}

app.post("/api/run/:platform", async (req, res) => {
  if (!checkAuth(req, res)) return;

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

  // Refresh keywords from /settings, then start run
  fetchKeywords(true)
    .catch(() => console.warn(`[api] Keyword refresh failed for ${platform}, using cached`))
    .then(() => runPlatform(platform))
    .catch((err) => console.error(`[api] ${platform} run failed:`, err));
});

// ---------------------------------------------------------------------------
// Scrape one or more URLs (manual paste from dashboard)
// Accepts: { url: string } OR { urls: string[] }
// ---------------------------------------------------------------------------

app.post("/api/scrape-url", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const body = req.body as { url?: string; urls?: string[] };

  // Normalize to array — supports both single and multi-URL
  const rawUrls: string[] =
    Array.isArray(body.urls) && body.urls.length > 0
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
  const badUrls: string[] = [];
  for (const u of rawUrls) {
    try { new URL(u); } catch { badUrls.push(u); }
  }
  if (badUrls.length > 0) {
    return res.status(400).json({ error: "Invalid URL format", invalid: badUrls });
  }

  console.log(`[api] Scrape URL triggered: ${rawUrls.length} URL(s)`);

  // Refresh keywords from /settings before scraping
  await fetchKeywords(true).catch(() => {});

  const items: UrlScrapeItemResult[] = [];

  for (const targetUrl of rawUrls) {
    try {
      // Rate limit check per platform
      const urlPlatform = detectPlatformFromUrl(targetUrl);
      const rateCheck = checkRateLimit(urlPlatform);
      if (!rateCheck.allowed) {
        const waitSec = Math.ceil(rateCheck.retryAfterMs / 1000);
        console.log(`[api] Rate limited (${urlPlatform}) for ${targetUrl} — retry in ${waitSec}s`);
        items.push({
          url: targetUrl,
          success: false,
          platform: urlPlatform,
          postsFound: 0,
          duration: 0,
          errors: [`Rate limited: ${urlPlatform} scrapes must be at least ${Math.ceil((config.platformRateLimitMs[urlPlatform] ?? 0) / 1000)}s apart. Retry in ${waitSec}s.`],
          batch: null,
          scrapedPosts: [],
        });
        continue;
      }
      recordScrapeStart(urlPlatform);

      const result = await scrapeUrlWithRetry(targetUrl, `[url-scraper]`);

      const discordErrors = result.errors.filter((e) => !e.includes("requires login") && !e.includes("page.goto: Timeout") && !e.includes("ERR_ABORTED"));
      if (discordErrors.length > 0) {
        await sendErrorAlert(result.platform, discordErrors.join("\n"));
      }

      // Pre-filter: reject job seekers, too-short posts, and unknown authors
      const preFiltered = filterPosts(result.posts, "[url-scraper]");
      const filtered = preFiltered.filter((p) => {
        if (!p.author || p.author.toLowerCase() === "unknown" || p.author.startsWith("urn:li:")) {
          console.log(`[url-scraper] Filtered unknown/invalid author: "${p.author}" — ${p.url}`);
          return false;
        }
        return true;
      });
      console.log(
        `[url-scraper] ${filtered.length} posts after filtering (${result.posts.length - filtered.length} rejected)`
      );

      let batchResult = null;
      if (filtered.length > 0) {
        batchResult = await sendLeadsBatch(filtered);
        if (batchResult) {
          await sendNewLeadsAlert(targetUrl, result.platform, filtered, batchResult);
        }
      }

      const keywordsByUrl = new Map<string, string[]>();
      for (const r of batchResult?.results ?? []) {
        if (r.url && r.matchedKeywords) keywordsByUrl.set(r.url, r.matchedKeywords);
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
    } catch (err) {
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
app.get("/api/schedules", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedules = await listSchedules();
  res.json({ success: true, count: schedules.length, schedules });
});

/** GET /api/schedules/runs — all run history (must be before :id) */
app.get("/api/schedules/runs", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const runs = await listRuns();
  res.json({ success: true, runs });
});

/** DELETE /api/schedules/runs — clear all run history */
app.delete("/api/schedules/runs", async (req, res) => {
  if (!checkAuth(req, res)) return;
  await clearRuns();
  res.json({ success: true });
});

/** GET /api/schedules/:id — get one */
app.get("/api/schedules/:id", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedule = await getSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true, schedule });
});

/** POST /api/schedules — create */
app.post("/api/schedules", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { name, url, cron, status } = req.body as {
    name?: string;
    url?: string;
    cron?: string;
    status?: string;
  };

  if (!name || !name.trim())
    return res.status(400).json({ error: "Field 'name' is required" });
  if (!url)
    return res.status(400).json({ error: "Field 'url' is required" });
  try { new URL(url); } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }
  if (!cron || !nodeCron.validate(cron))
    return res.status(400).json({ error: "'cron' is required and must be a valid cron expression" });
  if (status && status !== "active" && status !== "paused")
    return res.status(400).json({ error: "'status' must be 'active' or 'paused'" });

  const schedule = await createSchedule({
    name: name.trim(),
    url: url.trim(),
    cron: cron.trim(),
    status: (status as "active" | "paused") ?? "active",
  });

  console.log(`[api] Schedule created: "${schedule.name}" (${schedule.cron})`);
  res.status(201).json({ success: true, schedule });
});

/** PATCH /api/schedules/:id — partial update */
app.patch("/api/schedules/:id", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { name, url, cron, status } = req.body as {
    name?: string;
    url?: string;
    cron?: string;
    status?: string;
  };

  if (url !== undefined) {
    try { new URL(url); } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }
  }
  if (cron !== undefined && !nodeCron.validate(cron))
    return res.status(400).json({ error: "Invalid cron expression" });
  if (status !== undefined && status !== "active" && status !== "paused")
    return res.status(400).json({ error: "'status' must be 'active' or 'paused'" });

  const updated = await updateSchedule(req.params.id, {
    ...(name !== undefined && { name: name.trim() }),
    ...(url !== undefined && { url: url.trim() }),
    ...(cron !== undefined && { cron: cron.trim() }),
    ...(status !== undefined && { status: status as "active" | "paused" }),
  });

  if (!updated) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true, schedule: updated });
});

/** DELETE /api/schedules/:id */
app.delete("/api/schedules/:id", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const deleted = await deleteSchedule(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true, deleted: true, id: req.params.id });
});

/** GET /api/schedules/:id/runs — run history for one schedule */
app.get("/api/schedules/:id/runs", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedule = await getSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });
  const runs = await listRuns(req.params.id);
  res.json({ success: true, runs });
});

/** POST /api/schedules/:id/pause */
app.post("/api/schedules/:id/pause", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedule = await pauseSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true, schedule });
});

/** POST /api/schedules/:id/resume */
app.post("/api/schedules/:id/resume", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedule = await resumeSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true, schedule });
});

/** POST /api/schedules/:id/run — trigger immediate run (single URL) */
app.post("/api/schedules/:id/run", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedule = await getSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  console.log(`[api] Manual trigger for schedule "${schedule.name}"`);
  try {
    await runScheduleNow(req.params.id);
    res.json({ success: true, schedule: await getSchedule(req.params.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** POST /api/schedules/:id/run-group — trigger all URLs in a schedule group sequentially */
app.post("/api/schedules/:id/run-group", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const schedule = await getSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  console.log(`[api] Manual group trigger from schedule "${schedule.name}"`);
  try {
    await runGroupNow(req.params.id);
    res.json({ success: true, schedule: await getSchedule(req.params.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// Browser login setup — saves cookies for authenticated scraping
// ---------------------------------------------------------------------------

app.post("/api/auth/setup", async (req, res) => {
  if (!checkAuth(req, res)) return;

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

app.get("/api/status", async (_req, res) => {
  const schedules = await listSchedules();
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
    urlSchedules: schedules.length,
  });
});

// ---------------------------------------------------------------------------
// Test Discord notification — sends mock Facebook leads alert
// ---------------------------------------------------------------------------

app.post("/api/test/discord", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const mockPosts = [
    {
      platform: "Facebook" as const,
      author: "Jane Smith",
      text: "Hey does anyone know a reliable virtual assistant for my e-commerce store? Need someone who can handle customer emails, order tracking, and basic social media. Budget is flexible for the right person.",
      url: "https://www.facebook.com/groups/sample/posts/test001",
      timestamp: new Date().toISOString(),
      engagement: 12,
      source: "facebook-group-test",
    },
    {
      platform: "Facebook" as const,
      author: "Mark Rivera",
      text: "Looking to hire a VA to help me manage my Shopify store and respond to customer messages. Must be fluent in English and available during US hours. DM if interested!",
      url: "https://www.facebook.com/groups/sample/posts/test002",
      timestamp: new Date().toISOString(),
      engagement: 8,
      source: "facebook-group-test",
    },
    {
      platform: "Facebook" as const,
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
    await sendNewLeadsAlert(
      "https://www.facebook.com/groups/sample-va-group",
      "Facebook",
      mockPosts,
      mockBatch
    );
    console.log("[api] Test Discord notification sent");
    res.json({ success: true, message: "Test Discord notification sent", leads: mockPosts.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api] Test Discord notification failed:", msg);
    res.status(500).json({ error: msg });
  }
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

  Server:    http://localhost:${config.port}
  Health:    http://localhost:${config.port}/health
  Status:    http://localhost:${config.port}/api/status
  Schedules: http://localhost:${config.port}/api/schedules
  Backend:   ${config.backendApiUrl}
  Headless:  ${config.headless}
  `);

  // Fetch user-configured keywords from /settings page before starting scrapers
  fetchKeywords().then((kw) => {
    if (kw) {
      console.log(`  Keywords: ${kw.searchQueries.length} search queries loaded from /settings`);
    } else {
      console.log("  Keywords: using env var defaults (backend unreachable or empty)");
    }
  }).catch(() => {
    console.log("  Keywords: using env var defaults (fetch failed)");
  });

  startScheduler();
  initUrlScheduler().catch((err) =>
    console.error("[server] Failed to init URL scheduler:", err)
  );
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[server] Shutting down...");
  stopScheduler();
  shutdownUrlScheduler();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[server] Shutting down...");
  stopScheduler();
  shutdownUrlScheduler();
  process.exit(0);
});
