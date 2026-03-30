import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * POST /api/keywords/discover
 *
 * AI Keyword Discovery — analyzes high-converting leads to suggest
 * new keywords that aren't in the user's current keyword list.
 *
 * How it works:
 * 1. Fetches the user's current keywords from the `keywords` table
 * 2. Fetches recent high-intent leads (score >= 70) from the last 30 days
 * 3. Sends lead texts + current keywords to Gemini
 * 4. Gemini returns suggested new keywords with category and reasoning
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured (GOOGLE_AI_API_KEY missing)" },
      { status: 503 }
    );
  }

  // 1. Load current keywords
  const { data: dbKeywords } = await supabase
    .from("keywords")
    .select("keyword, category")
    .order("created_at", { ascending: true });

  const currentKeywords = (dbKeywords || []).map((r) => r.keyword.toLowerCase());

  // 2. Fetch recent high-intent leads (last 30 days, score >= 70)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: leads } = await supabase
    .from("leads")
    .select("text, intent_score, intent_level, matched_keywords")
    .gte("created_at", thirtyDaysAgo)
    .gte("intent_score", 70)
    .order("intent_score", { ascending: false })
    .limit(50);

  if (!leads || leads.length === 0) {
    return NextResponse.json({
      suggestions: [],
      message: "No high-intent leads found in the last 30 days to analyze.",
    });
  }

  // 3. Build AI prompt
  const leadSamples = leads
    .slice(0, 30)
    .map((l, i) => `[${i + 1}] (Score: ${l.intent_score}) ${(l.text as string).slice(0, 300)}`)
    .join("\n\n");

  const prompt = `You are a keyword discovery assistant for a Virtual Assistant lead generation platform.

CURRENT KEYWORDS (already configured by the user):
${currentKeywords.length > 0 ? currentKeywords.join(", ") : "(none configured yet)"}

RECENT HIGH-INTENT LEADS (these are real posts from people looking to hire VAs):
${leadSamples}

---

TASK: Analyze these high-intent lead posts and suggest NEW search keywords/phrases that would help find MORE posts like these.

RULES:
1. Do NOT suggest keywords that are already in the current list above
2. Focus on phrases that indicate HIRING INTENT (someone wanting to hire a VA)
3. Include both specific phrases ("need someone to manage my shopify") and general ones ("hiring remote help")
4. Categorize each as "high_intent" (actively hiring) or "medium_intent" (exploring/considering)
5. Return 10-20 suggestions maximum
6. Keep phrases lowercase
7. Focus on actionable search phrases that would work as Google/Reddit search queries

OUTPUT FORMAT (strict JSON array):
[
  { "keyword": "the suggested phrase", "category": "high_intent", "reason": "why this keyword matters" },
  ...
]

Return ONLY the JSON array, no other text.`;

  // 4. Call Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response — handle both bare array and wrapped object
    let jsonStr = responseText.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    const suggestions: Array<{
      keyword: string;
      category: string;
      reason: string;
    }> = Array.isArray(parsed) ? parsed : (parsed.suggestions ?? []);

    // Filter out any that are already in the user's list
    const filtered = suggestions.filter(
      (s) =>
        s.keyword &&
        s.category &&
        ["high_intent", "medium_intent"].includes(s.category) &&
        !currentKeywords.includes(s.keyword.toLowerCase())
    );

    return NextResponse.json({
      suggestions: filtered,
      leadsAnalyzed: leads.length,
      currentKeywordCount: currentKeywords.length,
    });
  } catch (err) {
    console.error("[keywords/discover] AI error:", err);
    return NextResponse.json(
      { error: "AI analysis failed. Try again in a moment." },
      { status: 500 }
    );
  }
}
