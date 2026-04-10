import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { qualifyLead } from "@/lib/ai-lead-qualifier";
import { inferLocationFromText } from "@/lib/geo-fallback";
import { supabase } from "@/lib/supabase";
import { alertEngine } from "@/lib/alert-engine";
import { HIRING_KEYWORDS } from "@/lib/keywords";
import type { Platform } from "@/lib/types";

interface IncomingPayload {
  platform: Platform;
  text: string;
  username: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;
  authorLocation?: string;
  detectedLanguage?: string;
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

  const { platform, text, username, url, timestamp, engagement, source, authorLocation, detectedLanguage } = payload;
  console.log(
    `[leads/process] Payload:`,
    `\n  Platform: ${platform}`,
    `\n  User: ${username}`,
    `\n  Text: ${text?.slice(0, 120)}...`,
    `\n  URL: ${url}`,
    `\n  Source: ${source}`,
    `\n  Engagement: ${engagement}`,
    authorLocation ? `\n  Author Location: ${authorLocation}` : "",
    detectedLanguage ? `\n  Detected Language: ${detectedLanguage}` : ""
  );

  if (!platform || !text || !username || !url) {
    console.warn("[leads/process] Missing required fields");
    return NextResponse.json({ error: "Missing required fields: platform, text, username, url" }, { status: 400 });
  }

  // --- Date gate: reject posts older than 7 days (all platforms) ---
  if (timestamp) {
    const postDate = new Date(timestamp);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    cutoff.setUTCHours(0, 0, 0, 0);
    if (!isNaN(postDate.getTime()) && postDate < cutoff) {
      console.log(`[leads/process] Post too old (${timestamp}) — only last 7 days accepted`);
      return NextResponse.json(
        { success: true, skipped: true, reason: `Post too old (${timestamp}) — only last 7 days accepted` },
        { status: 200 }
      );
    }
  }

  // --- Deduplication by URL or post content ---
  const { data: existingByUrl } = await supabase
    .from("leads")
    .select("id")
    .eq("url", url)
    .maybeSingle();

  if (existingByUrl) {
    console.log(`[leads/process] Duplicate URL detected — existing lead ID: ${existingByUrl.id}`);
    return NextResponse.json(
      { success: true, duplicate: true, reason: "url", leadId: existingByUrl.id },
      { status: 200 }
    );
  }

  const { data: existingByText } = await supabase
    .from("leads")
    .select("id")
    .eq("text", text.slice(0, 5000))
    .maybeSingle();

  if (existingByText) {
    console.log(`[leads/process] Duplicate content detected — existing lead ID: ${existingByText.id}`);
    return NextResponse.json(
      { success: true, duplicate: true, reason: "content", leadId: existingByText.id },
      { status: 200 }
    );
  }

  // --- Keyword gate: only keep posts that match at least one user keyword ---
  let userKeywords: string[] = [];
  const { data: dbKeywords } = await supabase
    .from("keywords")
    .select("keyword, category")
    .order("created_at", { ascending: true });

  if (dbKeywords && dbKeywords.length > 0) {
    for (const row of dbKeywords) {
      if (row.category === "high_intent" || row.category === "medium_intent") {
        userKeywords.push(row.keyword.toLowerCase());
      }
    }
  } else {
    userKeywords = HIRING_KEYWORDS.map((kw) => kw.toLowerCase());
  }

  const lowerText = text.toLowerCase();
  const hasKeywordMatch = userKeywords.some((kw) => lowerText.includes(kw));
  if (!hasKeywordMatch) {
    console.log(`[leads/process] No keyword match — skipped`);
    return NextResponse.json(
      { success: true, skipped: true, reason: "No keyword match" },
      { status: 200 }
    );
  }

  // --- Intent Scoring (AI-first with keyword fallback) ---
  const { scoring: scoringResult, aiResult, source: scoringSource } = await qualifyLead({
    platform,
    author: username,
    text,
    url,
    engagement: engagement || 0,
    authorLocation,
    detectedLanguage,
    source,
  });
  console.log(
    `[leads/process] Scoring result (${scoringSource}):`,
    `\n  Score: ${scoringResult.score}`,
    `\n  Level: ${scoringResult.level}`,
    `\n  Category: ${scoringResult.category}`,
    `\n  Matched keywords: [${scoringResult.matchedKeywords.join(", ")}]`,
    aiResult ? `\n  AI Summary: ${aiResult.leadSummary}` : ""
  );

  // --- Resolve geographic location (AI → keyword fallback) ---
  let aiLocation = aiResult?.location && aiResult.location !== "Others"
    ? aiResult.location
    : null;

  // If AI returned null or "Others", try keyword-based geo fallback
  if (!aiLocation || aiLocation === "Others") {
    const fallbackLocation = inferLocationFromText(text, source || "", authorLocation, detectedLanguage);
    if (fallbackLocation) {
      aiLocation = fallbackLocation;
      console.log(`[leads/process] Geo fallback resolved: ${fallbackLocation}`);
    }
  }

  // Merge scoring keywords with ALL user keywords that appear in the post
  const userMatches = userKeywords.filter((kw) => lowerText.includes(kw));
  const allKeywords = Array.from(new Set([...userMatches, ...scoringResult.matchedKeywords]));

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
      matched_keywords: allKeywords,
      detected_at: timestamp || new Date().toISOString(),
      user_id: session.userId,
      ...(aiLocation ? { location: aiLocation } : {}),
      ...(aiResult ? { ai_qualification: aiResult } : {}),
    })
    .select("id, intent_score, intent_level")
    .single();

  if (insertError) {
    console.error("[leads/process] Supabase insert error:", insertError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  console.log(`[leads/process] Lead inserted — ID: ${lead.id}, Score: ${lead.intent_score}, Level: ${lead.intent_level}`);

  // --- Smart alert for High + Medium intent leads (skip Low) ---
  if (scoringResult.level === "High" || scoringResult.level === "Medium") {
    console.log(`[leads/process] ${scoringResult.level} intent (${scoringResult.score}) — enqueuing alert`);
    alertEngine.enqueue({
      author_name: username,
      message: text.slice(0, 500),
      url,
      platform,
      source: source || "Unknown",
      score: scoringResult.score,
      level: scoringResult.level,
      category: scoringResult.category,
      matchedKeywords: allKeywords,
      created_time: timestamp || new Date().toISOString(),
    });
  } else {
    console.log(`[leads/process] Low intent (${scoringResult.score}) — no alert`);
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
