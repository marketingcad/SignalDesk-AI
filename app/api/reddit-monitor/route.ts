import { NextRequest, NextResponse } from "next/server";
import { runRedditMonitor } from "@/lib/reddit-monitor";

// ---------------------------------------------------------------------------
// GET /api/reddit-monitor — Cron-triggered Reddit monitoring
//
// Called by Vercel Cron every 5 minutes. Protected by CRON_SECRET so only
// Vercel's scheduler (or someone with the secret) can trigger it.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runRedditMonitor();

    console.log(
      `[reddit-monitor] Complete — fetched=${result.fetched} classified=${result.classified} notified=${result.notified} skipped=${result.skipped} errors=${result.errors}`
    );

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    console.error("[reddit-monitor] Fatal error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
