import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import http from "http";

// Mock heavy dependencies before importing the app modules
vi.mock("../crawler/crawlerManager", () => ({
  runAllPlatforms: vi.fn(async () => []),
  runPlatform: vi.fn(async () => ({ platform: "Reddit", posts: [], duration: 100, errors: [] })),
  isRunning: vi.fn(() => false),
}));

const mockValidateCookies = vi.fn(async (_platform: string) => "valid" as string);
const mockValidateAllCookies = vi.fn(async () => ({
  facebook: "valid" as string,
  linkedin: "valid" as string,
}));
const mockLoginAndSave = vi.fn();
const mockHasSavedCookies = vi.fn(() => true);

vi.mock("../crawler/browserAuth", () => ({
  loginAndSave: mockLoginAndSave,
  hasSavedCookies: mockHasSavedCookies,
  validateCookies: mockValidateCookies,
  validateAllCookies: mockValidateAllCookies,
}));

vi.mock("../api/backendClient", () => ({
  sendLeadsBatch: vi.fn(async () => null),
  fetchKeywords: vi.fn(async () => null),
  getCachedKeywords: vi.fn(() => null),
}));

vi.mock("../alerts/discord", () => ({
  sendRunSummary: vi.fn(),
  sendErrorAlert: vi.fn(),
  sendNewLeadsAlert: vi.fn(),
  sendAuthExpiredAlert: vi.fn(),
  sendSessionHealthAlert: vi.fn(),
}));

vi.mock("../scheduler/cronJobs", () => ({
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
}));

vi.mock("../scheduler/urlScheduler", () => ({
  initUrlScheduler: vi.fn(async () => {}),
  shutdownUrlScheduler: vi.fn(),
  listSchedules: vi.fn(async () => []),
  getSchedule: vi.fn(async () => null),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  pauseSchedule: vi.fn(),
  resumeSchedule: vi.fn(),
  runScheduleNow: vi.fn(),
  listRuns: vi.fn(async () => []),
  clearRuns: vi.fn(),
  runGroupNow: vi.fn(),
}));

// Set env vars before config is loaded
process.env.BACKEND_AUTH_TOKEN = "test-token-123";

import {
  getAllHealth,
  resetHealth,
  reportRunResult,
  reportValidationResult,
  getPlatformHealth,
} from "../utils/sessionHealth";
import type { Platform } from "../types";

const AUTH_HEADER = { Authorization: "Bearer test-token-123" };

// Build a test app that mirrors the real scraper service routes
function buildTestApp() {
  const app = express();
  app.use(express.json());

  function checkAuth(req: express.Request, res: express.Response): boolean {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer test-token-123`) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  // --- Health check ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // --- Auth status (public) ---
  app.get("/api/auth/status", (_req, res) => {
    res.json({ cookiesSaved: mockHasSavedCookies() });
  });

  // --- Auth health (protected) ---
  app.get("/api/auth/health", (req, res) => {
    if (!checkAuth(req, res)) return;
    const health = getAllHealth();
    const hasExpired = health.some((h) => h.status === "expired");
    const hasWarning = health.some((h) => h.status === "warning");
    res.json({
      overall: hasExpired ? "expired" : hasWarning ? "warning" : "healthy",
      platforms: health,
      cookiesSaved: mockHasSavedCookies(),
    });
  });

  // --- Auth setup (trigger browser login) ---
  app.post("/api/auth/setup", (req, res) => {
    if (!checkAuth(req, res)) return;
    mockLoginAndSave();
    res.json({ message: "Browser opening — log in to your accounts then close the browser window" });
  });

  // --- Auth validate ---
  app.post("/api/auth/validate", async (req, res) => {
    if (!checkAuth(req, res)) return;
    const { platform } = req.body as { platform?: string };
    const validPlatforms = ["facebook", "linkedin"];
    const platformMap: Record<string, Platform> = { facebook: "Facebook", linkedin: "LinkedIn" };

    if (platform && !validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({ error: `Invalid platform` });
    }

    if (platform) {
      const result = await mockValidateCookies(platform.toLowerCase());
      const platformKey = platformMap[platform.toLowerCase()];
      if (platformKey && result !== "error") {
        reportValidationResult(platformKey, result as "valid" | "expired" | "no_cookies");
      }
      res.json({ success: true, platform, result });
    } else {
      const results = await mockValidateAllCookies();
      for (const [key, result] of Object.entries(results)) {
        const p = platformMap[key];
        if (p && result !== "error") {
          reportValidationResult(p, result as "valid" | "expired" | "no_cookies");
        }
      }
      res.json({ success: true, results });
    }
  });

  // --- Auth health reset ---
  app.post("/api/auth/health/reset", (req, res) => {
    if (!checkAuth(req, res)) return;
    const { platform } = req.body as { platform?: string };
    const platformMap: Record<string, Platform> = {
      facebook: "Facebook", linkedin: "LinkedIn", reddit: "Reddit", x: "X",
    };

    if (platform) {
      const p = platformMap[platform.toLowerCase()];
      if (!p) return res.status(400).json({ error: "Invalid platform" });
      resetHealth(p);
      res.json({ success: true, reset: p });
    } else {
      Object.values(platformMap).forEach(resetHealth);
      res.json({ success: true, reset: "all" });
    }
  });

  return app;
}

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = buildTestApp();
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetHealth("Facebook");
  resetHealth("LinkedIn");
  resetHealth("Reddit");
  resetHealth("X");
  vi.clearAllMocks();
  mockHasSavedCookies.mockReturnValue(true);
  mockValidateCookies.mockResolvedValue("valid");
  mockValidateAllCookies.mockResolvedValue({
    facebook: "valid",
    linkedin: "valid",
  });
});

// =========================================================================
// Health check
// =========================================================================

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
  });
});

// =========================================================================
// Auth status (public)
// =========================================================================

describe("GET /api/auth/status", () => {
  it("returns cookiesSaved true when cookies exist", async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.cookiesSaved).toBe(true);
  });

  it("returns cookiesSaved false when no cookies", async () => {
    mockHasSavedCookies.mockReturnValue(false);
    const res = await fetch(`${baseUrl}/api/auth/status`);
    const data = await res.json();
    expect(data.cookiesSaved).toBe(false);
  });
});

// =========================================================================
// Auth health (protected)
// =========================================================================

describe("GET /api/auth/health", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/api/auth/health`);
    expect(res.status).toBe(401);
  });

  it("returns healthy when all platforms are clean", async () => {
    const res = await fetch(`${baseUrl}/api/auth/health`, { headers: AUTH_HEADER });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.overall).toBe("healthy");
    expect(data.platforms).toHaveLength(4);
    expect(data.cookiesSaved).toBe(true);
  });

  it("returns expired when a platform crosses threshold", async () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);

    const res = await fetch(`${baseUrl}/api/auth/health`, { headers: AUTH_HEADER });
    const data = await res.json();
    expect(data.overall).toBe("expired");

    const fb = data.platforms.find((p: { platform: string }) => p.platform === "Facebook");
    expect(fb.status).toBe("expired");
    expect(fb.consecutiveZeroRuns).toBe(3);
  });

  it("returns warning at threshold - 1 (when threshold >= 3)", async () => {
    reportRunResult("LinkedIn", 0);
    reportRunResult("LinkedIn", 0);

    const res = await fetch(`${baseUrl}/api/auth/health`, { headers: AUTH_HEADER });
    const data = await res.json();
    expect(data.overall).toBe("warning");

    const li = data.platforms.find((p: { platform: string }) => p.platform === "LinkedIn");
    expect(li.status).toBe("warning");
  });
});

// =========================================================================
// Auth setup (trigger browser login)
// =========================================================================

describe("POST /api/auth/setup", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/api/auth/setup`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("triggers loginAndSave and returns success message", async () => {
    const res = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("Browser opening");
    expect(mockLoginAndSave).toHaveBeenCalledOnce();
  });
});

// =========================================================================
// Auth validate
// =========================================================================

describe("POST /api/auth/validate", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/api/auth/validate`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("validates a single platform and returns result", async () => {
    const res = await fetch(`${baseUrl}/api/auth/validate`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "facebook" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.platform).toBe("facebook");
    expect(data.result).toBe("valid");
  });

  it("validates all platforms when no platform specified", async () => {
    const res = await fetch(`${baseUrl}/api/auth/validate`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results).toEqual({ facebook: "valid", linkedin: "valid" });
  });

  it("rejects invalid platform", async () => {
    const res = await fetch(`${baseUrl}/api/auth/validate`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "twitter" }),
    });
    expect(res.status).toBe(400);
  });

  it("updates session health when cookies are expired", async () => {
    mockValidateCookies.mockResolvedValue("expired");

    const res = await fetch(`${baseUrl}/api/auth/validate`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "facebook" }),
    });
    const data = await res.json();
    expect(data.result).toBe("expired");

    // Health state should reflect the expired cookies
    const health = getPlatformHealth("Facebook");
    expect(health.lastValidationResult).toBe("expired");
    expect(health.status).toBe("expired");
  });

  it("does not update health on validation error", async () => {
    mockValidateCookies.mockResolvedValue("error");

    await fetch(`${baseUrl}/api/auth/validate`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "linkedin" }),
    });

    // Health state should remain at default (no update on error)
    const health = getPlatformHealth("LinkedIn");
    expect(health.lastValidationResult).toBeNull();
    expect(health.status).toBe("healthy");
  });
});

// =========================================================================
// Auth health reset
// =========================================================================

describe("POST /api/auth/health/reset", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/api/auth/health/reset`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("resets a single platform", async () => {
    // Put Facebook into expired state
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    expect(getPlatformHealth("Facebook").status).toBe("expired");

    const res = await fetch(`${baseUrl}/api/auth/health/reset`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "facebook" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.reset).toBe("Facebook");

    // Health should be back to healthy
    expect(getPlatformHealth("Facebook").status).toBe("healthy");
    expect(getPlatformHealth("Facebook").consecutiveZeroRuns).toBe(0);
  });

  it("resets all platforms when no platform specified", async () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("LinkedIn", 0);
    reportRunResult("LinkedIn", 0);
    reportRunResult("LinkedIn", 0);

    const res = await fetch(`${baseUrl}/api/auth/health/reset`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reset).toBe("all");

    expect(getPlatformHealth("Facebook").status).toBe("healthy");
    expect(getPlatformHealth("LinkedIn").status).toBe("healthy");
  });

  it("rejects invalid platform", async () => {
    const res = await fetch(`${baseUrl}/api/auth/health/reset`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "invalid" }),
    });
    expect(res.status).toBe(400);
  });
});
