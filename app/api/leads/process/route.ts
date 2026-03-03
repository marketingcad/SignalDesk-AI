import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { scoreIntent } from "@/lib/intent-scoring";
import { supabase } from "@/lib/supabase";
import { sendDiscordNotification } from "@/lib/facebook-webhook";
import type { Platform } from "@/lib/types";

interface IncomingPayload {
  platform: Platform;
  text: string;
  username: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;
}

export async function POST(request: NextRequest) {
  // --- Auth: Bearer token ---
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // --- Parse body ---
  let payload: IncomingPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { platform, text, username, url, timestamp, engagement, source } = payload;

  if (!platform || !text || !username || !url) {
    return NextResponse.json({ error: "Missing required fields: platform, text, username, url" }, { status: 400 });
  }

  // --- Deduplication by URL ---
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("url", url)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: true, duplicate: true, leadId: existing.id },
      { status: 200 }
    );
  }

  // --- Intent Scoring ---
  const scoringResult = scoreIntent({ text, engagement: engagement || 0, platform });

  // --- Insert lead ---
  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      platform,
      source: source || "Unknown",
      username,
      text: text.slice(0, 5000),
      url,
      intent_score: scoringResult.score,
      intent_level: scoringResult.level,
      intent_category: scoringResult.category,
      status: "New",
      engagement: engagement || 0,
      matched_keywords: scoringResult.matchedKeywords,
      detected_at: timestamp || new Date().toISOString(),
      user_id: session.userId,
    })
    .select("id, intent_score, intent_level")
    .single();

  if (insertError) {
    console.error("[leads/process] Insert error:", insertError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // --- Discord alert for high-intent leads ---
  if (scoringResult.score >= 80) {
    await sendDiscordNotification({
      type: "HIRING_VA",
      author_name: username,
      message: text.slice(0, 500),
      post_id: url,
      created_time: timestamp || new Date().toISOString(),
    }).catch((err) => console.error("[leads/process] Discord error:", err));
  }

  return NextResponse.json(
    {
      success: true,
      leadId: lead.id,
      intentScore: lead.intent_score,
      intentLevel: lead.intent_level,
    },
    { status: 201 }
  );
}
