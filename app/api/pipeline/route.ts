import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getPipelineLeads } from "@/lib/leads";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leads = await getPipelineLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("[api/pipeline] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
