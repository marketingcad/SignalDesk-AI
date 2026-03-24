import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { HIRING_KEYWORDS, SEEKING_KEYWORDS } from "@/lib/keywords";

/**
 * GET /api/keywords/search-queries
 *
 * Returns keywords formatted for scraper consumption:
 * - searchQueries: string[]  → used for Facebook/LinkedIn/X search + Google dorks
 * - negativeKeywords: string[]  → used to reject job-seeker / self-promo posts
 * - scoringConfig: { high_intent, medium_intent, negative } → for DynamicScoringConfig
 *
 * The scraper calls this on startup and before each run so keywords
 * are always in sync with whatever the user configured in /settings.
 */
export async function GET(request: NextRequest) {
  // Auth — supports both cookie-based (dashboard) and Bearer token (scraper)
  const authHeader = request.headers.get("authorization");
  const cookieToken = request.cookies.get("session")?.value;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load from Supabase keywords table
  const { data: dbKeywords } = await supabase
    .from("keywords")
    .select("keyword, category")
    .order("created_at", { ascending: true });

  let highIntent: string[] = [];
  let mediumIntent: string[] = [];
  let negative: string[] = [];

  if (dbKeywords && dbKeywords.length > 0) {
    for (const row of dbKeywords) {
      switch (row.category) {
        case "high_intent":
          highIntent.push(row.keyword);
          break;
        case "medium_intent":
          mediumIntent.push(row.keyword);
          break;
        case "negative":
          negative.push(row.keyword);
          break;
      }
    }
  } else {
    // Fallback to static keywords when DB is empty
    // Categorize HIRING_KEYWORDS into high/medium based on phrase patterns
    const highPatterns = [
      "looking for a virtual assistant","looking for va", "hiring a virtual assistant","hiring a va","hiring va","hire a va","hire a virtual assistant",
      "looking for", "hiring", "hire", "need a", "want to hire",
      "searching for", "needed", "asap", "immediately", "urgently",
      "outsourc", "[hiring]",
    ];
    for (const kw of HIRING_KEYWORDS) {
      const lower = kw.toLowerCase();
      if (highPatterns.some((p) => lower.includes(p))) {
        highIntent.push(kw);
      } else {
        mediumIntent.push(kw);
      }
    }
    negative = [...SEEKING_KEYWORDS];
  }

  // searchQueries = all positive keywords (for scraper search URLs + Google dorks)
  const searchQueries = [...highIntent, ...mediumIntent];

  return NextResponse.json({
    searchQueries,
    negativeKeywords: negative,
    scoringConfig: {
      high_intent: highIntent,
      medium_intent: mediumIntent,
      negative,
    },
  });
}
