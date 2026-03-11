import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { qualifyLeadsBatch } from "@/lib/ai-lead-qualifier";
import { supabase } from "@/lib/supabase";
import { alertEngine } from "@/lib/alert-engine";
import type { Platform, AIQualificationResult } from "@/lib/types";

interface IncomingPost {
  platform: Platform;
  text: string;
  username: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;
}

interface BatchResult {
  url: string;
  leadId?: string;
  intentScore?: number;
  intentLevel?: string;
  matchedKeywords?: string[];
  duplicate?: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  console.log("[leads/batch] ---- Incoming batch request ----");

  // --- Auth ---
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const session = await verifySession(authHeader.slice(7));
  if (!session) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // --- Parse body ---
  let posts: IncomingPost[];
  try {
    const body = await request.json();
    posts = body.posts;
    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: "posts must be a non-empty array" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`[leads/batch] Processing ${posts.length} posts for user ${session.userId}`);

  // --- Bulk dedup: by URL and by post content ---
  const urls = posts.map((p) => p.url).filter(Boolean);
  const texts = posts.map((p) => p.text?.slice(0, 5000)).filter(Boolean);

  const [{ data: existingByUrl }, { data: existingByText }] = await Promise.all([
    supabase.from("leads").select("id, url").in("url", urls),
    supabase.from("leads").select("id, text").in("text", texts),
  ]);

  const existingUrlMap = new Map<string, string>();
  for (const lead of existingByUrl || []) {
    existingUrlMap.set(lead.url, lead.id);
  }

  const existingTextMap = new Map<string, string>();
  for (const lead of existingByText || []) {
    existingTextMap.set(lead.text, lead.id);
  }

  const dupCount = existingUrlMap.size + existingTextMap.size;
  console.log(`[leads/batch] ${dupCount} duplicates found (${existingUrlMap.size} by URL, ${existingTextMap.size} by content)`);

  // --- Filter valid, non-duplicate posts ---
  const results: BatchResult[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  const scoredLeads: Array<{ post: IncomingPost; score: number; level: string; category: string; matchedKeywords: string[]; aiResult: AIQualificationResult | null }> = [];

  const validPosts: IncomingPost[] = [];
  const seenTexts = new Set<string>(); // also dedup within the batch itself

  for (const post of posts) {
    if (!post.platform || !post.text || !post.username || !post.url) {
      results.push({ url: post.url || "unknown", error: "Missing required fields" });
      continue;
    }
    const existingId = existingUrlMap.get(post.url);
    if (existingId) {
      results.push({ url: post.url, duplicate: true, leadId: existingId });
      continue;
    }
    const textKey = post.text.slice(0, 5000);
    const existingTextId = existingTextMap.get(textKey);
    if (existingTextId) {
      results.push({ url: post.url, duplicate: true, leadId: existingTextId });
      continue;
    }
    // Dedup within current batch (same content from different URLs)
    if (seenTexts.has(textKey)) {
      results.push({ url: post.url, duplicate: true, error: "Duplicate content in batch" });
      continue;
    }
    seenTexts.add(textKey);
    validPosts.push(post);
  }

  // --- Score all valid posts (rate-limited chunks with retry + keyword fallback) ---
  if (validPosts.length > 0) {
    const qualifyResults = await qualifyLeadsBatch(
      validPosts.map((post) => ({
        platform: post.platform,
        author: post.username,
        text: post.text,
        url: post.url,
        engagement: post.engagement || 0,
      }))
    );

    for (let i = 0; i < validPosts.length; i++) {
      const post = validPosts[i];
      const { scoring, aiResult } = qualifyResults[i];

      toInsert.push({
        platform: post.platform,
        source: post.source || "Unknown",
        username: post.username,
        text: post.text.slice(0, 5000),
        url: post.url,
        intent_score: scoring.score,
        intent_level: scoring.level,
        intent_category: scoring.category,
        status: "New",
        engagement: post.engagement || 0,
        matched_keywords: scoring.matchedKeywords,
        detected_at: post.timestamp || new Date().toISOString(),
        user_id: session.userId,
        ...(aiResult ? { ai_qualification: aiResult } : {}),
      });

      scoredLeads.push({
        post,
        score: scoring.score,
        level: scoring.level,
        category: scoring.category,
        matchedKeywords: scoring.matchedKeywords,
        aiResult,
      });
    }
  }

  // --- Bulk insert ---
  let insertedCount = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("leads")
      .insert(toInsert)
      .select("id, url, intent_score, intent_level");

    if (insertError) {
      console.error("[leads/batch] Bulk insert error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    insertedCount = inserted?.length || 0;

    // Map inserted IDs back to results
    const insertedMap = new Map<string, { id: string; intent_score: number; intent_level: string }>();
    for (const row of inserted || []) {
      insertedMap.set(row.url, row);
    }

    for (const scored of scoredLeads) {
      const row = insertedMap.get(scored.post.url);
      if (row) {
        results.push({
          url: scored.post.url,
          leadId: row.id,
          intentScore: row.intent_score,
          intentLevel: row.intent_level,
          matchedKeywords: scored.matchedKeywords,
        });

        // Enqueue High + Medium intent leads for alerting (skip Low)
        if (scored.level === "High" || scored.level === "Medium") {
          alertEngine.enqueue({
            author_name: scored.post.username,
            message: scored.post.text.slice(0, 500),
            url: scored.post.url,
            platform: scored.post.platform,
            source: scored.post.source || "Unknown",
            score: scored.score,
            level: scored.level,
            category: scored.category,
            matchedKeywords: scored.matchedKeywords,
            created_time: scored.post.timestamp || new Date().toISOString(),
          });
        }
      }
    }
  }

  console.log(
    `[leads/batch] Done — ${insertedCount} inserted, ${existingUrlMap.size} duplicates, ${results.filter((r) => r.error).length} errors`
  );

  return NextResponse.json(
    {
      success: true,
      processed: posts.length,
      inserted: insertedCount,
      duplicates: existingUrlMap.size,
      results,
    },
    { status: 201 }
  );
}
