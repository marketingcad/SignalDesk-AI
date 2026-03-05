import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import { scoreIntent } from "@/lib/intent-scoring";
import { supabase } from "@/lib/supabase";
import { alertEngine } from "@/lib/alert-engine";
import type { Platform } from "@/lib/types";

/**
 * POST /api/apify/webhook
 *
 * Receives webhook callbacks from Apify when an actor run completes.
 * Fetches the dataset, normalizes posts, scores intent, stores in DB,
 * and triggers Discord alerts for high-intent leads.
 *
 * Configure in Apify Console:
 *   Webhook URL: https://your-app.vercel.app/api/apify/webhook
 *   Event: ACTOR.RUN.SUCCEEDED
 *
 * Security: Verified by checking the APIFY_WEBHOOK_SECRET header.
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

  // Verify webhook secret (optional but recommended)
  const secret = request.headers.get("x-apify-webhook-secret");
  const expectedSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    console.warn("[apify/webhook] Invalid webhook secret");
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
    // Fetch results from Apify dataset
    const client = new ApifyClient({ token: apifyToken });
    const { items } = await client.dataset(datasetId).listItems({
      limit: parseInt(process.env.APIFY_MAX_RESULTS || "50", 10),
    });

    console.log(`[apify/webhook] Fetched ${items.length} items from dataset ${datasetId}`);

    // Detect platform from actor ID
    const actorId = (resource.actId || resource.actorId || "") as string;
    const platform = detectPlatform(actorId);

    // Normalize posts
    const posts: NormalizedPost[] = items
      .map((item: Record<string, unknown>) => normalizeItem(item, platform))
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
        _scoring: scoring, // Temporary — not inserted
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
        console.error("[apify/webhook] Insert error:", insertError);
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

    const timestamp = String(
      item.time || item.timestamp || item.createdAt || item.created_at ||
      item.publishedAt || item.postedAt || item.date || item.created_utc ||
      new Date().toISOString()
    );

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
