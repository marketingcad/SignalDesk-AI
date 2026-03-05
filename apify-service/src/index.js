import express from "express";
import { config } from "./config.js";
import { runAllActors } from "./run-actors.js";
import { sendToBackend } from "./backend.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

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
  const authHeader = req.headers.authorization;
  if (config.backendAuthToken && authHeader !== `Bearer ${config.backendAuthToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (runInProgress) {
    return res.status(409).json({ error: "A scrape run is already in progress" });
  }

  runInProgress = true;
  try {
    const results = await runAllActors();
    res.json({ success: true, results });
  } catch (err) {
    console.error("[server] Run error:", err.message);
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

  console.log("[webhook] Received Apify webhook:", JSON.stringify(body, null, 2).slice(0, 500));

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

function startScheduler() {
  const intervalMs = config.runIntervalMinutes * 60 * 1000;
  if (intervalMs < 60_000) return; // Don't run more than once per minute

  console.log(`[scheduler] Will run actors every ${config.runIntervalMinutes} minutes`);

  scheduledTimer = setInterval(async () => {
    if (runInProgress) {
      console.log("[scheduler] Skipping — run already in progress");
      return;
    }
    runInProgress = true;
    try {
      await runAllActors();
    } catch (err) {
      console.error("[scheduler] Error:", err.message);
    } finally {
      runInProgress = false;
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
  console.log(`\nSignalDesk Apify Service listening on port ${config.port}`);
  console.log(`Backend: ${config.backendApiUrl}`);
  console.log(`Apify token: ${config.apifyToken ? "configured" : "NOT SET"}`);
  console.log(`Platforms: FB=${config.targets.facebook.length} LI=${config.targets.linkedin.length} RD=${config.targets.reddit.length} X=${config.targets.x.length}`);

  // Start scheduler if interval is configured
  if (config.runIntervalMinutes > 0) {
    startScheduler();
  }
});
