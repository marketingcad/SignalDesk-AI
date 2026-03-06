import express from "express";
import { config } from "./config.js";
import { runAllActors } from "./run-actors.js";
import { sendToBackend } from "./backend.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

function ts() {
  return new Date().toLocaleString("en-US", {
    hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit",
    month: "short", day: "2-digit", year: "numeric",
  });
}

let runCount = 0;

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    configuredPlatforms: {
      facebook: config.targets.facebook.length,
      linkedin: config.targets.linkedin.length,
      reddit: config.targets.reddit.length,
      x: config.targets.x.length,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/run — Trigger a full scrape cycle manually
// ---------------------------------------------------------------------------

let runInProgress = false;

app.post("/api/run", async (req, res) => {
  console.log(`[${ts()}] [api] POST /api/run — manual trigger`);

  const authHeader = req.headers.authorization;
  if (config.backendAuthToken && authHeader !== `Bearer ${config.backendAuthToken}`) {
    console.log(`[${ts()}] [api] 401 — invalid auth token`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (runInProgress) {
    console.log(`[${ts()}] [api] 409 — run already in progress`);
    return res.status(409).json({ error: "A scrape run is already in progress" });
  }

  runInProgress = true;
  runCount++;
  console.log(`[${ts()}] [api] Starting manual run #${runCount}`);
  try {
    const results = await runAllActors();
    res.json({ success: true, results });
  } catch (err) {
    console.error(`[${ts()}] [api] Run error: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    runInProgress = false;
  }
});

// ---------------------------------------------------------------------------
// POST /api/webhook — Receive Apify webhook callbacks
// Called by Apify when an actor run completes (configure in Apify Console)
//
// Apify sends: { resource: { defaultDatasetId, status, ... }, eventType, ... }
// ---------------------------------------------------------------------------

app.post("/api/webhook", async (req, res) => {
  const body = req.body;

  console.log(`\n[${ts()}] [webhook] ---- Incoming Apify webhook ----`);
  console.log(`[${ts()}] [webhook] Event: ${body.eventType || "unknown"}`);
  console.log(`[${ts()}] [webhook] Actor: ${body.resource?.actId || "unknown"}`);
  console.log(`[${ts()}] [webhook] Status: ${body.resource?.status || "unknown"}`);
  console.log(`[${ts()}] [webhook] Dataset: ${body.resource?.defaultDatasetId || "none"}`);

  const resource = body.resource;
  if (!resource || resource.status !== "SUCCEEDED") {
    console.log("[webhook] Run not succeeded — ignoring");
    return res.json({ ok: true, skipped: true });
  }

  const datasetId = resource.defaultDatasetId;
  if (!datasetId) {
    console.warn("[webhook] No datasetId in webhook payload");
    return res.status(400).json({ error: "No datasetId" });
  }

  try {
    // Dynamically import ApifyClient to fetch the dataset
    const { ApifyClient } = await import("apify-client");
    const client = new ApifyClient({ token: config.apifyToken });
    const { items } = await client.dataset(datasetId).listItems({
      limit: config.maxResultsPerRun,
    });

    console.log(`[webhook] Fetched ${items.length} items from dataset ${datasetId}`);

    // Try to detect platform from actor ID in the webhook
    const actorId = resource.actId || resource.actorId || "";
    const platform = detectPlatformFromActor(actorId);

    // Simple normalization — extract common fields
    const posts = items
      .map((item) => ({
        platform: platform || item.platform || "Unknown",
        text: item.text || item.message || item.postText || item.full_text || item.content || "",
        username: item.user?.name || item.authorName || item.author || item.username || "Unknown",
        url: item.url || item.postUrl || item.link || item.permalink || "",
        timestamp: item.time || item.timestamp || item.createdAt || item.date || new Date().toISOString(),
        engagement: (item.likes || 0) + (item.comments || 0) + (item.shares || 0) + (item.score || 0),
        source: "apify",
      }))
      .filter((p) => p.text && p.text.length > 20);

    console.log(`[webhook] ${posts.length} posts after normalization`);

    // Send to backend
    const result = await sendToBackend(posts);

    res.json({
      ok: true,
      scraped: items.length,
      normalized: posts.length,
      inserted: result?.inserted || 0,
      duplicates: result?.duplicates || 0,
    });
  } catch (err) {
    console.error("[webhook] Error processing:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function detectPlatformFromActor(actorId) {
  const id = actorId.toLowerCase();
  if (id.includes("facebook")) return "Facebook";
  if (id.includes("linkedin")) return "LinkedIn";
  if (id.includes("reddit")) return "Reddit";
  if (id.includes("twitter") || id.includes("tweet") || id.includes("quacker")) return "X";
  return null;
}

// ---------------------------------------------------------------------------
// Scheduled runs (optional — fires every RUN_INTERVAL_MINUTES)
// ---------------------------------------------------------------------------

let scheduledTimer = null;
let nextRunAt = null;

function startScheduler() {
  const intervalMs = config.runIntervalMinutes * 60 * 1000;
  if (intervalMs < 60_000) return;

  nextRunAt = new Date(Date.now() + intervalMs);
  console.log(`[${ts()}] [scheduler] Scheduled to run every ${config.runIntervalMinutes} min`);
  console.log(`[${ts()}] [scheduler] Next run at: ${nextRunAt.toLocaleString()}`);

  scheduledTimer = setInterval(async () => {
    runCount++;
    console.log(`\n[${ts()}] [scheduler] ====== SCHEDULED RUN #${runCount} ======`);

    if (runInProgress) {
      console.log(`[${ts()}] [scheduler] Skipping — previous run still in progress`);
      return;
    }

    runInProgress = true;
    try {
      await runAllActors();
    } catch (err) {
      console.error(`[${ts()}] [scheduler] ERROR: ${err.message}`);
    } finally {
      runInProgress = false;
      nextRunAt = new Date(Date.now() + intervalMs);
      console.log(`[${ts()}] [scheduler] Next run at: ${nextRunAt.toLocaleString()}`);
    }
  }, intervalMs);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down`);
  if (scheduledTimer) clearInterval(scheduledTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = app.listen(config.port, () => {
  console.log();
  console.log("=".repeat(60));
  console.log(`  SignalDesk Apify Service — Started at ${ts()}`);
  console.log("=".repeat(60));
  console.log(`  Port:           ${config.port}`);
  console.log(`  Backend:        ${config.backendApiUrl}`);
  console.log(`  Apify token:    ${config.apifyToken ? "configured" : "NOT SET"}`);
  console.log(`  Backend token:  ${config.backendAuthToken ? "configured" : "NOT SET"}`);
  console.log(`  Discord:        ${config.discordWebhookUrl ? "configured" : "NOT SET"}`);
  console.log(`  Interval:       every ${config.runIntervalMinutes} min`);
  console.log(`  Max results:    ${config.maxResultsPerRun} per actor`);
  console.log("  " + "-".repeat(56));
  console.log(`  Platforms:`);
  console.log(`    Facebook:  ${config.targets.facebook.length} target(s) ${config.targets.facebook.length > 0 ? JSON.stringify(config.targets.facebook) : ""}`);
  console.log(`    LinkedIn:  ${config.targets.linkedin.length} target(s) ${config.targets.linkedin.length > 0 ? JSON.stringify(config.targets.linkedin) : ""}`);
  console.log(`    Reddit:    ${config.targets.reddit.length} target(s) ${config.targets.reddit.length > 0 ? JSON.stringify(config.targets.reddit) : ""}`);
  console.log(`    X:         ${config.targets.x.length} target(s) ${config.targets.x.length > 0 ? JSON.stringify(config.targets.x) : ""}`);
  console.log("=".repeat(60));
  console.log();

  if (config.runIntervalMinutes > 0) {
    startScheduler();
  }
});
