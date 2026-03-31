import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { HIRING_KEYWORDS } from "@/lib/keywords";

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || "http://localhost:4000";
const SCRAPER_TOKEN = process.env.BACKEND_AUTH_TOKEN || "";

type ScraperPost = {
  author: string;
  text: string;
  url: string;
  platform: string;
  timestamp?: string;
  matchedKeywords?: string[];
};

type BatchResultEntry = {
  url: string;
  leadId?: string;
  duplicate?: boolean;
};

type ScraperItemResult = {
  url: string;
  success: boolean;
  platform?: string | null;
  postsFound?: number;
  duration?: number;
  errors?: string[];
  batch?: {
    inserted: number;
    duplicates: number;
    results?: BatchResultEntry[];
  } | null;
  scrapedPosts?: ScraperPost[];
  error?: string;
};

type ScraperMultiResponse = {
  success?: boolean;
  totalUrls?: number;
  totalPostsFound?: number;
  totalInserted?: number;
  totalDuplicates?: number;
  items?: ScraperItemResult[];
  error?: string;
};

async function logScrapeSession(
  userId: string,
  scrapedUrl: string,
  item: ScraperItemResult
): Promise<string | null> {
  const isSuccess = item.success && !item.error;
  const { data: session, error } = await supabase
    .from("scrape_url_sessions")
    .insert({
      scraped_url: scrapedUrl,
      platform: item.platform ?? null,
      posts_found: item.postsFound ?? 0,
      posts_inserted: item.batch?.inserted ?? 0,
      duplicates: item.batch?.duplicates ?? 0,
      success: isSuccess,
      error_message: item.error ?? (item.errors?.join("; ") ?? null),
      user_id: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[scrape-url] Failed to log session:", error.message);
    return null;
  }
  return session.id as string;
}

async function logScrapedPosts(
  sessionId: string,
  posts: ScraperPost[],
  batchResults: BatchResultEntry[]
): Promise<void> {
  if (posts.length === 0) return;

  // Load user keywords (DB first, fallback to static)
  let userKeywords: string[] = [];
  const { data: dbKeywords } = await supabase
    .from("keywords")
    .select("keyword, category")
    .order("created_at", { ascending: true });

  if (dbKeywords && dbKeywords.length > 0) {
    userKeywords = dbKeywords
      .filter((k: { category: string }) => k.category === "high_intent" || k.category === "medium_intent")
      .map((k: { keyword: string }) => k.keyword.toLowerCase());
  } else {
    userKeywords = HIRING_KEYWORDS.map((kw) => kw.toLowerCase());
  }

  // Filter out posts with opaque/broken author IDs (e.g. LinkedIn URNs).
  // "unknown" authors are allowed — Facebook Google dork results have valid post URLs without author names.
  const validPosts = posts.filter((p) => {
    if (p.author?.startsWith("urn:li:")) {
      console.log(`[scrape-url] Skipping post with opaque LinkedIn author: "${p.author}" — ${p.url}`);
      return false;
    }
    // Keyword gate: only keep posts that match at least one user keyword
    const lowerText = (p.text || "").toLowerCase();
    const hasKeywordMatch = userKeywords.some((kw) => lowerText.includes(kw));
    if (!hasKeywordMatch) {
      console.log(`[scrape-url] Skipping post with no keyword match: "${p.text?.slice(0, 80)}..." — ${p.url}`);
      return false;
    }
    return true;
  });

  if (validPosts.length === 0) {
    console.log(`[scrape-url] All ${posts.length} posts filtered out (unknown authors or no keyword match) — nothing to save`);
    return;
  }

  if (validPosts.length < posts.length) {
    console.log(`[scrape-url] Filtered out ${posts.length - validPosts.length} posts (unknown authors or no keyword match)`);
  }

  const resultByUrl = new Map<string, BatchResultEntry>();
  for (const r of batchResults) {
    if (r.url) resultByUrl.set(r.url, r);
  }
  const rows = validPosts.map((p) => {
    const br = resultByUrl.get(p.url);
    return {
      session_id: sessionId,
      author: p.author,
      description: p.text,
      post_url: p.url,
      platform: p.platform ?? null,
      post_date: p.timestamp ?? null,
      matched_keywords: p.matchedKeywords ?? [],
      lead_id: br?.leadId ?? null,
      is_duplicate: br?.duplicate ?? false,
    };
  });
  const { error } = await supabase
    .from("scraped_posts")
    .upsert(rows, { onConflict: "post_url", ignoreDuplicates: true });
  if (error) console.error("[scrape-url] Failed to log scraped posts:", error.message);
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("scrape_url_sessions")
    .select(
      "id, scraped_url, platform, posts_found, posts_inserted, duplicates, success, error_message, scraped_at"
    )
    .eq("user_id", session.userId)
    .order("scraped_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[scrape-url] Failed to fetch history:", error.message);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }

  return NextResponse.json({ sessions: data });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id");

  if (sessionId) {
    // Delete a single session and its posts
    const { error: postsErr } = await supabase
      .from("scraped_posts")
      .delete()
      .eq("session_id", sessionId);
    if (postsErr) {
      console.error("[scrape-url] Failed to delete posts:", postsErr.message);
    }

    const { error } = await supabase
      .from("scrape_url_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", session.userId);

    if (error) {
      console.error("[scrape-url] Failed to delete session:", error.message);
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }
  } else {
    // Delete all sessions and their posts for this user
    // First get all session IDs
    const { data: sessions } = await supabase
      .from("scrape_url_sessions")
      .select("id")
      .eq("user_id", session.userId);

    if (sessions && sessions.length > 0) {
      const ids = sessions.map((s) => s.id);
      const { error: postsErr } = await supabase
        .from("scraped_posts")
        .delete()
        .in("session_id", ids);
      if (postsErr) {
        console.error("[scrape-url] Failed to delete posts:", postsErr.message);
      }
    }

    const { error } = await supabase
      .from("scrape_url_sessions")
      .delete()
      .eq("user_id", session.userId);

    if (error) {
      console.error("[scrape-url] Failed to clear history:", error.message);
      return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Normalize: accept { url } (legacy) or { urls } (multi)
  const rawUrls: string[] =
    Array.isArray(body.urls) && body.urls.length > 0
      ? body.urls
      : typeof body.url === "string" && body.url.trim()
      ? [body.url.trim()]
      : [];

  if (rawUrls.length === 0) {
    return NextResponse.json(
      { error: "Provide 'url' (string) or 'urls' (string array)" },
      { status: 400 }
    );
  }

  const badUrls: string[] = [];
  for (const u of rawUrls) {
    try { new URL(u); } catch { badUrls.push(u); }
  }
  if (badUrls.length > 0) {
    return NextResponse.json({ error: "Invalid URL format", invalid: badUrls }, { status: 400 });
  }

  try {
    const resp = await fetch(`${SCRAPER_URL}/api/scrape-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SCRAPER_TOKEN}`,
      },
      body: JSON.stringify({ urls: rawUrls }),
      signal: AbortSignal.timeout(300_000),
    });

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await resp.text();
      console.error("[scrape-url] Non-JSON response:", text.slice(0, 200));
      const errMsg = `Scraper service returned an unexpected response. Is it running on ${SCRAPER_URL}?`;
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    const data: ScraperMultiResponse = await resp.json();

    if (!resp.ok) {
      return NextResponse.json({ error: data.error || "Scraper service error" }, { status: resp.status });
    }

    // Log a session row per URL
    for (const item of data.items ?? []) {
      const sessionId = await logScrapeSession(session.userId, item.url, item);
      if (sessionId && item.scrapedPosts?.length) {
        await logScrapedPosts(sessionId, item.scrapedPosts, item.batch?.results ?? []);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scrape-url] Scraper service error:", msg);
    const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    const hint = isConnRefused
      ? `Scraper service is not running. Start it with: cd scraper-service && npm run dev`
      : msg;
    return NextResponse.json({ error: hint }, { status: 502 });
  }
}
