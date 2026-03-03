import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getChartData } from "@/lib/leads";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(request.nextUrl.searchParams.get("days")) || 7;

  try {
    const data = await getChartData(days);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/dashboard/chart] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
