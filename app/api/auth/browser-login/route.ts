import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || "http://localhost:4000";
const SCRAPER_TOKEN = process.env.BACKEND_AUTH_TOKEN || "";

async function proxyToScraper(method: string, path: string, body?: unknown) {
  const resp = await fetch(`${SCRAPER_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SCRAPER_TOKEN}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await resp.json().catch(() => ({}));
  return { data, status: resp.status };
}

/**
 * GET /api/auth/browser-login
 * Returns scraper auth status + session health for all platforms.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Fetch both status and health in parallel
    const [statusRes, healthRes] = await Promise.all([
      proxyToScraper("GET", "/api/auth/status"),
      proxyToScraper("GET", "/api/auth/health"),
    ]);

    return NextResponse.json({
      cookiesSaved: statusRes.data?.cookiesSaved ?? false,
      health: healthRes.data ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Scraper service unreachable", detail: msg },
      { status: 502 }
    );
  }
}

/**
 * POST /api/auth/browser-login
 * Triggers the scraper to open a visible browser for manual login.
 * Body: { action: "login" | "validate" | "reset", platform?: string }
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action || "login";
  const platform = (body as { platform?: string }).platform;

  try {
    let result;

    switch (action) {
      case "login":
        result = await proxyToScraper("POST", "/api/auth/setup");
        break;
      case "validate":
        result = await proxyToScraper("POST", "/api/auth/validate", { platform });
        break;
      case "reset":
        result = await proxyToScraper("POST", "/api/auth/health/reset", { platform });
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Scraper service unreachable", detail: msg },
      { status: 502 }
    );
  }
}
