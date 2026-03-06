import { NextRequest, NextResponse } from "next/server";
import { scoreIntent } from "@/lib/intent-scoring";
import { supabase } from "@/lib/supabase";
import { alertEngine } from "@/lib/alert-engine";
import type { Platform } from "@/lib/types";

/**
 * POST /api/apify/webhook
 *
 * Receives webhook callbacks from Apify when an actor run completes.
 * Fetches the dataset via REST API, normalizes posts, scores intent,
 * stores in DB, and triggers Discord alerts for high-intent leads.
 */

interface NormalizedPost {
  platform: Platform;
  text: string;
  username: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;
}

export async function POST(request: NextRequest) {
  console.log("[apify/webhook] ---- Incoming webhook ----");

  // Verify webhook secret
  const secret = request.headers.get("x-apify-webhook-secret");
  const expectedSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    console.warn("[apify/webhook] Invalid webhook secret");
    console.warn(`[apify/webhook] Got: "${secret?.slice(0, 10)}..." Expected: "${expectedSecret?.slice(0, 10)}..."`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resource = body.resource as Record<string, unknown> | undefined;
  if (!resource || resource.status !== "SUCCEEDED") {
    console.log("[apify/webhook] Run not succeeded — ignoring");
    return NextResponse.json({ ok: true, skipped: true });
  }

  const datasetId = resource.defaultDatasetId as string;
  if (!datasetId) {
    return NextResponse.json({ error: "No datasetId" }, { status: 400 });
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    console.error("[apify/webhook] APIFY_API_TOKEN not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    // Fetch results from Apify dataset via REST API (no SDK needed)
    const maxResults = parseInt(process.env.APIFY_MAX_RESULTS || "50", 10);
    const apiUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=${maxResults}&format=json`;
    const res = await fetch(apiUrl);

    if (!res.ok) {
      console.error(`[apify/webhook] Apify API error: ${res.status} ${res.statusText}`);
      return NextResponse.json({ error: "Failed to fetch dataset" }, { status: 502 });
    }

    const items = (await res.json()) as Record<string, unknown>[];
    console.log(`[apify/webhook] Fetched ${items.length} items from dataset ${datasetId}`);

    // Detect platform from actor ID
    const actorId = (resource.actId || resource.actorId || "") as string;
    const platform = detectPlatform(actorId);
    console.log(`[apify/webhook] Actor: ${actorId} -> Platform: ${platform || "Unknown"}`);

    // Normalize posts
    const posts: NormalizedPost[] = items
      .map((item) => normalizeItem(item, platform))
      .filter((p): p is NormalizedPost => p !== null && p.text.length > 20);

    console.log(`[apify/webhook] ${posts.length} posts after normalization`);

    if (posts.length === 0) {
      return NextResponse.json({ ok: true, scraped: items.length, inserted: 0 });
    }

    // Bulk dedup
    const urls = posts.map((p) => p.url).filter(Boolean);
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("url")
      .in("url", urls);

    const existingUrls = new Set((existingLeads || []).map((l) => l.url));
    const newPosts = posts.filter((p) => !existingUrls.has(p.url));

    console.log(`[apify/webhook] ${newPosts.length} new posts (${existingUrls.size} duplicates)`);

    // Score and insert
    const toInsert = newPosts.map((post) => {
      const scoring = scoreIntent({
        text: post.text,
        engagement: post.engagement,
        platform: post.platform,
      });

      return {
        platform: post.platform,
        source: "apify",
        username: post.username,
        text: post.text.slice(0, 5000),
        url: post.url,
        intent_score: scoring.score,
        intent_level: scoring.level,
        intent_category: scoring.category,
        status: "New",
        engagement: post.engagement,
        matched_keywords: scoring.matchedKeywords,
        detected_at: post.timestamp,
        _scoring: scoring,
      };
    });

    // Insert into DB (without _scoring field)
    const dbRows = toInsert.map(({ _scoring, ...rest }) => rest);

    if (dbRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("leads")
        .insert(dbRows)
        .select("id, url, intent_score, intent_level");

      if (insertError) {
        console.error("[apify/webhook] Insert error:", JSON.stringify(insertError));
        if (dbRows.length > 0) {
          console.error("[apify/webhook] Sample row:", JSON.stringify(dbRows[0]));
        }
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      // Trigger alerts for high-intent leads
      for (const row of toInsert) {
        if (row._scoring.score >= 80) {
          alertEngine.enqueue({
            author_name: row.username,
            message: row.text.slice(0, 500),
            url: row.url,
            platform: row.platform,
            source: "apify",
            score: row._scoring.score,
            level: row._scoring.level,
            category: row._scoring.category,
            matchedKeywords: row._scoring.matchedKeywords,
            created_time: row.detected_at || new Date().toISOString(),
          });
        }
      }

      console.log(`[apify/webhook] Inserted ${inserted?.length || 0} leads`);

      // Log high-intent leads
      const highIntent = toInsert.filter((r) => r._scoring.score >= 80);
      if (highIntent.length > 0) {
        console.log(`[apify/webhook] ${highIntent.length} high-intent leads (score >= 80) — Discord alerts queued`);
      }
    }

    return NextResponse.json({
      ok: true,
      scraped: items.length,
      normalized: posts.length,
      inserted: dbRows.length,
      duplicates: existingUrls.size,
    });
  } catch (err) {
    console.error("[apify/webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function detectPlatform(actorId: string): Platform | null {
  const id = actorId.toLowerCase();
  if (id.includes("facebook")) return "Facebook";
  if (id.includes("linkedin")) return "LinkedIn";
  if (id.includes("reddit")) return "Reddit";
  if (id.includes("twitter") || id.includes("tweet")) return "X";
  return null;
}

function normalizeItem(
  item: Record<string, unknown>,
  platform: Platform | null
): NormalizedPost | null {
  try {
    const text = String(
      item.text || item.message || item.postText || item.full_text ||
      item.content || item.title || ""
    ).trim();

    const body = item.body || item.selftext || "";
    const fullText = body ? `${text} ${body}`.trim() : text;

    if (!fullText) return null;

    const user = item.user as Record<string, unknown> | undefined;
    const username = String(
      user?.name || user?.screen_name ||
      item.authorName || item.author || item.username || item.userName || "Unknown"
    );

    const permalink = item.permalink as string | undefined;
    const url = String(
      item.url || item.postUrl || item.link || item.tweetUrl ||
      (permalink?.startsWith("http") ? permalink : permalink ? `https://www.reddit.com${permalink}` : "") ||
      (item.id ? `https://x.com/i/status/${item.id}` : "") ||
      ""
    );

    const rawTimestamp =
      item.time || item.timestamp || item.createdAt || item.created_at ||
      item.publishedAt || item.postedAt || item.date || item.created_utc;
    let timestamp: string;
    if (!rawTimestamp) {
      timestamp = new Date().toISOString();
    } else if (typeof rawTimestamp === "number") {
      timestamp = new Date(
        rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp
      ).toISOString();
    } else {
      timestamp = String(rawTimestamp);
    }

    const likes = Number(item.likes || item.favorite_count || item.numLikes || 0);
    const comments = Number(item.comments || item.numComments || item.num_comments || 0);
    const shares = Number(item.shares || item.retweet_count || item.numShares || 0);
    const score = Number(item.score || 0);

    return {
      platform: platform || (item.platform as Platform) || "Facebook",
      text: fullText.slice(0, 2000),
      username,
      url,
      timestamp,
      engagement: likes + comments + shares + score,
      source: "apify",
    };
  } catch {
    return null;
  }
}
