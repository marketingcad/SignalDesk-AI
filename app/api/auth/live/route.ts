import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const SCRAPER_URL = (process.env.SCRAPER_SERVICE_URL || "http://localhost:4000").replace(/\/+$/, "");
const SCRAPER_TOKEN = process.env.BACKEND_AUTH_TOKEN || "";

async function proxyToScraper(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000
) {
  const resp = await fetch(`${SCRAPER_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SCRAPER_TOKEN}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await resp.json().catch(() => ({}));
  return { data, status: resp.status };
}

async function requireSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await verifySession(token) : null;
}

/** GET /api/auth/live — current live-login session status. */
export async function GET(request: NextRequest) {
  if (!(await requireSession(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, status } = await proxyToScraper("GET", "/api/auth/live/status");
    return NextResponse.json(data, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Scraper unreachable", detail: msg }, { status: 502 });
  }
}

/**
 * POST /api/auth/live — drive the remote login browser.
 * Body: { action: "start" | "save" | "cancel", platform?: string }
 *
 * On "start" we return an absolute `viewerUrl` (scraper origin + viewer path +
 * one-time token) the dashboard opens in a new tab to stream the live browser.
 */
export async function POST(request: NextRequest) {
  if (!(await requireSession(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action || "start";
  const platform = (body as { platform?: string }).platform;

  try {
    if (action === "start") {
      // The viewer opens in the user's browser, so SCRAPER_URL must be a public
      // URL — and HTTPS in production (an http:// or localhost target would be
      // unreachable or mixed-content-blocked from the HTTPS dashboard).
      const isProd = process.env.NODE_ENV === "production";
      if (isProd && !/^https:\/\//i.test(SCRAPER_URL)) {
        return NextResponse.json(
          { error: "Live Login is unavailable: SCRAPER_SERVICE_URL must be a public https:// URL in production." },
          { status: 503 }
        );
      }
      // Clear any leftover/stuck session first so the button never fails with
      // "a session is already active" (mirrors the npm run live-login fallback).
      await proxyToScraper("POST", "/api/auth/live/cancel").catch(() => {});
      // Starting the session boots a real browser on a virtual display, which on
      // a cold scraper (binaries not yet warm) can take well over 30s — give it
      // headroom so the dashboard doesn't report a false "Scraper unreachable".
      const { data, status } = await proxyToScraper("POST", "/api/auth/live/start", { platform }, 75_000);
      if (status >= 200 && status < 300 && data?.viewerPath) {
        return NextResponse.json(
          { ...data, viewerUrl: `${SCRAPER_URL}${data.viewerPath}` },
          { status }
        );
      }
      return NextResponse.json(data, { status });
    }
    if (action === "save") {
      const { data, status } = await proxyToScraper("POST", "/api/auth/live/save");
      return NextResponse.json(data, { status });
    }
    if (action === "cancel") {
      const { data, status } = await proxyToScraper("POST", "/api/auth/live/cancel");
      return NextResponse.json(data, { status });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    // AbortSignal.timeout fires a TimeoutError — that's a slow start, not an
    // outage, so tell the user to retry rather than implying the scraper is down.
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        { error: "The login browser took too long to start. Please try again." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: "Scraper unreachable", detail: msg }, { status: 502 });
  }
}
