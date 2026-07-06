import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getOutreachAnalytics } from "@/lib/outreach-analytics";

// ---------------------------------------------------------------------------
// GET /api/analytics/outreach?days=30
// Outreach "close the loop" analytics. Available to all logged-in users.
// See docs/outreach-analytics/README.md.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days =
    Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365
      ? Math.round(daysParam)
      : 30;

  try {
    const analytics = await getOutreachAnalytics(days);
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("[api/analytics/outreach] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
