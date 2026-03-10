import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || "http://localhost:4000";
const SCRAPER_TOKEN = process.env.BACKEND_AUTH_TOKEN || "";

export async function POST(request: NextRequest) {
  // Auth: require logged-in dashboard user
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { url } = body as { url?: string };

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing 'url' field" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Proxy to scraper service
  try {
    const resp = await fetch(`${SCRAPER_URL}/api/scrape-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SCRAPER_TOKEN}`,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(300_000), // 5 min timeout
    });

    // Guard against non-JSON responses (e.g. scraper service down / HTML error page)
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await resp.text();
      console.error("[scrape-url] Non-JSON response from scraper:", text.slice(0, 200));
      return NextResponse.json(
        { error: "Scraper service returned an unexpected response. Is it running on " + SCRAPER_URL + "?" },
        { status: 502 }
      );
    }

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: data.error || "Scraper service error" },
        { status: resp.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scrape-url] Scraper service error:", msg);

    // Provide a helpful error message
    const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    const hint = isConnRefused
      ? `Scraper service is not running. Start it with: cd scraper-service && npm run dev`
      : msg;

    return NextResponse.json(
      { error: hint },
      { status: 502 }
    );
  }
}
