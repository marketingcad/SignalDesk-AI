import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { scoreIntent } from "@/lib/intent-scoring";
import { supabase } from "@/lib/supabase";
import { alertEngine } from "@/lib/alert-engine";
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
  console.log("[leads/process] ---- Incoming request ----");

  // --- Auth: Bearer token ---
  const authHeader = request.headers.get("authorization");
  const xSource = request.headers.get("x-source") || "unknown";
  console.log(`[leads/process] Source: ${xSource}`);

  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[leads/process] Missing authorization header");
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const session = await verifySession(token);
  if (!session) {
    console.warn("[leads/process] Invalid token");
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  console.log(`[leads/process] Authenticated user: ${session.userId}`);

  // --- Parse body ---
  let payload: IncomingPayload;
  try {
    payload = await request.json();
  } catch {
    console.warn("[leads/process] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { platform, text, username, url, timestamp, engagement, source } = payload;
  console.log(
    `[leads/process] Payload:`,
    `\n  Platform: ${platform}`,
    `\n  User: ${username}`,
    `\n  Text: ${text?.slice(0, 120)}...`,
    `\n  URL: ${url}`,
    `\n  Source: ${source}`,
    `\n  Engagement: ${engagement}`
  );

  if (!platform || !text || !username || !url) {
    console.warn("[leads/process] Missing required fields");
    return NextResponse.json({ error: "Missing required fields: platform, text, username, url" }, { status: 400 });
  }

  // --- Deduplication by URL ---
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("url", url)
    .maybeSingle();

  if (existing) {
    console.log(`[leads/process] Duplicate detected — existing lead ID: ${existing.id}`);
    return NextResponse.json(
      { success: true, duplicate: true, leadId: existing.id },
      { status: 200 }
    );
  }

  // --- Intent Scoring ---
  const scoringResult = scoreIntent({ text, engagement: engagement || 0, platform });
  console.log(
    `[leads/process] Scoring result:`,
    `\n  Score: ${scoringResult.score}`,
    `\n  Level: ${scoringResult.level}`,
    `\n  Category: ${scoringResult.category}`,
    `\n  Matched keywords: [${scoringResult.matchedKeywords.join(", ")}]`
  );

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
    console.error("[leads/process] Supabase insert error:", insertError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  console.log(`[leads/process] Lead inserted — ID: ${lead.id}, Score: ${lead.intent_score}, Level: ${lead.intent_level}`);

  // --- Smart alert for high-intent leads (batched, deduped, rate-limited) ---
  if (scoringResult.score >= 65) {
    console.log(`[leads/process] High intent (${scoringResult.score}) — enqueuing alert`);
    alertEngine.enqueue({
      author_name: username,
      message: text.slice(0, 500),
      url,
      platform,
      source: source || "Unknown",
      score: scoringResult.score,
      level: scoringResult.level,
      category: scoringResult.category,
      matchedKeywords: scoringResult.matchedKeywords,
      created_time: timestamp || new Date().toISOString(),
    });
  } else {
    console.log(`[leads/process] Score ${scoringResult.score} < 65 — no alert`);
  }

  console.log("[leads/process] ---- Request complete ----");

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
