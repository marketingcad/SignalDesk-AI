import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getPlatformCounts } from "@/lib/leads";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await getPlatformCounts();
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[api/dashboard/platform-counts] Error:", err);
    return NextResponse.json({ error: "Failed to fetch platform counts" }, { status: 500 });
  }
}
