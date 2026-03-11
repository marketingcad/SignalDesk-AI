import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || "http://localhost:4000";
const SCRAPER_TOKEN = process.env.BACKEND_AUTH_TOKEN || "";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get("scheduleId");
  const path = scheduleId
    ? `/api/schedules/${scheduleId}/runs`
    : "/api/schedules/runs";

  try {
    const resp = await fetch(`${SCRAPER_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SCRAPER_TOKEN}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
