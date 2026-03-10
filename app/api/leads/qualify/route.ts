import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { qualifyLeadWithAI } from "@/lib/ai-lead-qualifier";
import type { Platform } from "@/lib/types";

interface QualifyPayload {
  platform: Platform;
  author: string;
  postContent: string;
  postUrl: string;
  engagement?: number;
}

export async function POST(request: NextRequest) {
  console.log("[leads/qualify] ---- Incoming request ----");

  // --- Auth ---
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const session = await verifySession(authHeader.slice(7));
  if (!session) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // --- Check API key ---
  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY not configured" },
      { status: 503 }
    );
  }

  // --- Parse body ---
  let payload: QualifyPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { platform, author, postContent, postUrl } = payload;

  if (!platform || !author || !postContent || !postUrl) {
    return NextResponse.json(
      { error: "Missing required fields: platform, author, postContent, postUrl" },
      { status: 400 }
    );
  }

  // --- AI Qualification ---
  const result = await qualifyLeadWithAI({
    platform,
    author,
    postContent,
    postUrl,
    engagement: payload.engagement,
  });

  if (!result) {
    return NextResponse.json(
      { error: "AI qualification failed" },
      { status: 500 }
    );
  }

  console.log(
    `[leads/qualify] Done — Score: ${result.aiResult.leadScore}/10`,
    `| Intent: ${result.aiResult.intentCategory}`,
    `| Hiring: ${result.aiResult.isHiring}`
  );

  return NextResponse.json(
    {
      success: true,
      qualification: result.aiResult,
      scoring: {
        score: result.scoring.score,
        level: result.scoring.level,
        category: result.scoring.category,
        matchedKeywords: result.scoring.matchedKeywords,
      },
    },
    { status: 200 }
  );
}
