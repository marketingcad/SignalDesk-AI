import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const SYSTEM_PROMPT = `You are an AI assistant for "SignalDesk AI", a lead intelligence platform focused on Virtual Assistants.

Your job is to help users find the best Virtual Assistant groups, communities, and URLs from Facebook and other platforms.

CRITICAL RULES ABOUT URLs:
- NEVER invent, guess, or fabricate Facebook group URLs. Facebook group URLs change frequently and most AI-generated links are FAKE and lead to 404 pages.
- For Facebook: Instead of fake URLs, provide the EXACT group name and a Facebook search link like: https://www.facebook.com/search/groups/?q=virtual%20assistant
- For Reddit: You CAN provide subreddit URLs (e.g., https://www.reddit.com/r/VirtualAssistant/) because subreddit names are stable and predictable.
- For LinkedIn: Provide search URLs like: https://www.linkedin.com/search/results/groups/?keywords=virtual%20assistant
- For other platforms: Only provide URLs you are 100% certain are real and stable.
- When you cannot provide a direct URL, give the user a SEARCH URL or step-by-step instructions to find the group.

When the user asks for VA groups, you should:
1. Recommend well-known, active Virtual Assistant groups by their EXACT NAME
2. Prioritize groups with large membership and high activity
3. Provide a platform search URL so the user can find each group easily
4. Categorize by platform (Facebook, LinkedIn, Reddit, etc.)
5. Note the estimated size/activity level of each group
6. Suggest search keywords the user can use to find more groups

Focus areas:
- Facebook Groups for hiring Virtual Assistants
- LinkedIn groups and communities for VA recruitment
- Reddit subreddits related to Virtual Assistants (r/VirtualAssistant, r/freelance, r/hireawriter, etc.)
- X/Twitter hashtags and communities for VA hiring
- Job platforms (Upwork, Fiverr, OnlineJobs.ph communities)

Format your response in clean markdown with:
- Group/community name (exact name)
- Platform
- Search URL or direct URL (only if verified/stable)
- Estimated members or activity level
- Brief description of why it's recommended

Be helpful, specific, and actionable. Always provide a way for the user to find the group even if you can't give a direct link.

IMPORTANT: Always respond in a helpful, conversational tone. If the user's question is not related to Virtual Assistants or group searching, politely redirect them to ask about VA groups and URLs.`;

const FREE_MODELS = [
  "gemini-2.5-flash",
];

// How many prior turns of conversation to send as context (bounds token usage).
const MAX_HISTORY_TURNS = 12;

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
  if (genAI) return genAI;
  const apiKey = process.env.GOOGLE_AI_API_KEY_SIGNAL_DESK_AI;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const ai = getGenAI();
    if (!ai) {
      return NextResponse.json(
        { error: "Google AI API key not configured" },
        { status: 500 }
      );
    }

    // Build multi-turn context from the prior conversation so follow-ups keep
    // context ("what about LinkedIn?", "only 10k+ members"). Cap to the last
    // few turns to bound token usage.
    const priorTurns: Array<{ role?: string; content?: string }> = Array.isArray(history)
      ? history
      : [];
    const geminiHistory = priorTurns
      .filter(
        (t) =>
          t &&
          (t.role === "user" || t.role === "assistant") &&
          typeof t.content === "string" &&
          t.content.trim().length > 0
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({
        role: t.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: t.content as string }],
      }));

    // Gemini requires the history to begin with a user turn — drop any leading
    // model turns that could survive slicing.
    while (geminiHistory.length > 0 && geminiHistory[0].role === "model") {
      geminiHistory.shift();
    }

    // Try models in order until one works
    for (const modelName of FREE_MODELS) {
      try {
        const model = ai.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        });

        const chat = model.startChat({ history: geminiHistory });
        const result = await chat.sendMessage(message.trim());
        const responseText = result.response.text();

        return NextResponse.json({ response: responseText, model: modelName });
      } catch (err: unknown) {
        console.warn(`[ai-assistant] Model ${modelName} failed:`, (err as Error).message || err);
        continue; // Try next model
      }
    }

    return NextResponse.json(
      { error: "All AI models are currently busy. Please try again in a moment." },
      { status: 503 }
    );
  } catch (err) {
    console.error("[ai-assistant] Error:", err);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
