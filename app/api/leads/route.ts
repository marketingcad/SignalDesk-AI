import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getLeads } from "@/lib/leads";
import type { Platform, IntentLevel, LeadStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;

  const filters = {
    platform: (searchParams.get("platform") as Platform) || undefined,
    intentLevel: (searchParams.get("intentLevel") as IntentLevel) || undefined,
    status: (searchParams.get("status") as LeadStatus) || undefined,
    search: searchParams.get("search") || undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 50,
    offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : 0,
  };

  try {
    const result = await getLeads(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/leads] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
