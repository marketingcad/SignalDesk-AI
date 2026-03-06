import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Fallback keywords from lib/keywords.ts (used when no DB records exist)
import { HIRING_KEYWORDS, SEEKING_KEYWORDS } from "@/lib/keywords";

type KeywordCategory = "high_intent" | "medium_intent" | "negative";

function categorizeHiringKeywords(keywords: string[]): {
  high_intent: string[];
  medium_intent: string[];
} {
  const highPatterns = [
    "looking for", "hiring", "hire", "need a", "want to hire",
    "searching for", "needed", "asap", "immediately", "urgently",
    "outsourc", "ready to hire", "[hiring]",
  ];
  const high: string[] = [];
  const medium: string[] = [];
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    if (highPatterns.some((p) => lower.includes(p))) {
      high.push(kw);
    } else {
      medium.push(kw);
    }
  }
  return { high_intent: high, medium_intent: medium };
}

// GET /api/keywords — returns keywords grouped by category
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try loading from supabase keywords table
  const { data } = await supabase
    .from("keywords")
    .select("*")
    .order("created_at", { ascending: true });

  if (data && data.length > 0) {
    const grouped: Record<KeywordCategory, string[]> = {
      high_intent: [],
      medium_intent: [],
      negative: [],
    };
    for (const row of data) {
      const cat = row.category as KeywordCategory;
      if (grouped[cat]) grouped[cat].push(row.keyword);
    }
    return NextResponse.json(grouped);
  }

  // Fallback to static keywords
  const { high_intent, medium_intent } = categorizeHiringKeywords(HIRING_KEYWORDS);
  return NextResponse.json({
    high_intent,
    medium_intent,
    negative: SEEKING_KEYWORDS,
  });
}

// POST /api/keywords — add a keyword
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { keyword, category } = body as { keyword: string; category: KeywordCategory };

  if (!keyword?.trim() || !["high_intent", "medium_intent", "negative"].includes(category)) {
    return NextResponse.json({ error: "Invalid keyword or category" }, { status: 400 });
  }

  const { error } = await supabase
    .from("keywords")
    .insert({ keyword: keyword.trim().toLowerCase(), category });

  if (error) {
    console.error("[api/keywords] Insert error:", error);
    return NextResponse.json({ error: "Failed to add keyword" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/keywords — remove a keyword
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyword, category } = (await request.json()) as { keyword: string; category: KeywordCategory };

  if (!keyword?.trim()) {
    return NextResponse.json({ error: "Missing keyword" }, { status: 400 });
  }

  const { error } = await supabase
    .from("keywords")
    .delete()
    .eq("keyword", keyword.trim().toLowerCase())
    .eq("category", category);

  if (error) {
    console.error("[api/keywords] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete keyword" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
