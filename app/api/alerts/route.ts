import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAlerts } from "@/lib/leads";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit")) || 20;

  try {
    const alerts = await getAlerts(limit);
    return NextResponse.json(alerts);
  } catch (error) {
    console.error("[api/alerts] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
