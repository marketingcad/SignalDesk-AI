import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAlerts, getArchivedAlerts, deleteArchivedAlerts } from "@/lib/leads";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit")) || 20;
  const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;
  const archived = request.nextUrl.searchParams.get("archived") === "true";

  try {
    const result = archived
      ? await getArchivedAlerts(limit, offset)
      : await getAlerts(limit, offset);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/alerts] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE /api/alerts — bulk delete all archived (Dismissed) alerts */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await deleteArchivedAlerts();
    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("[api/alerts] Delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
