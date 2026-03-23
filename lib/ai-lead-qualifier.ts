import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  Platform,
  IntentLevel,
  IntentCategory,
  AIQualificationResult,
} from "./types";
import { scoreIntent, type ScoringResult } from "./intent-scoring";

// ---------------------------------------------------------------------------
// Google Gemini AI Lead Qualification Agent
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an AI Lead Qualification Agent for a Virtual Assistant marketplace platform called "SignalDesk AI".

Your task is to analyze social media posts and determine whether the author is genuinely looking to hire a Virtual Assistant or remote assistant.

Return structured JSON output only.

---

STEP 1 — Hiring Intent Detection

Determine whether the post indicates real hiring intent.

Possible values:
* true
* false
* "uncertain"

Look for signals such as:
* asking for help
* requesting a Virtual Assistant
* describing tasks
* asking for recommendations
* job postings

---

STEP 2 — Lead Intent Classification

Classify the post into one category:
* HIGH_INTENT → actively hiring or urgently looking for a Virtual Assistant
* MEDIUM_INTENT → looking for help but not clearly hiring yet
* LOW_INTENT → discussing Virtual Assistants but not hiring
* NOT_RELATED → unrelated to hiring

---

STEP 3 — Extract Job Requirements

If the post is related to hiring or assistance, extract:
* tasks requested
* skills required
* tools mentioned
* industry (if detectable)
* remote or location-based

---

STEP 4 — Urgency Detection

Estimate urgency level:
* HIGH → urgent hiring, immediate need
* MEDIUM → planning to hire soon
* LOW → casual discussion or future interest

---

STEP 5 — Budget Estimation

Estimate potential budget signals if mentioned.

Possible outputs:
* hourly_low
* hourly_mid
* hourly_high
* monthly_contract
* unknown

If no budget clues exist, return "unknown".

---

STEP 6 — Spam and Scam Detection

Detect whether the post may be:
* spam
* MLM
* fake hiring
* lead farming
* vague recruitment

Return:
* SAFE
* SUSPICIOUS
* LIKELY_SCAM

Provide a short reason.

---

STEP 7 — Geographic Location

Infer the poster's most likely country based on ALL available clues:
* Explicit mentions: "US-based", "from the Philippines", "UK company"
* Location requirements: "PST hours", "EST timezone", "must be in Europe"
* Currency: "$" = likely US/CA/AU, "£" = UK, "€" = EU
* Language/spelling: "colour" = UK/AU, "color" = US
* Platform group name if it includes a country (e.g. "Australian VA Community")
* Cultural context: holiday names, local platforms, regional slang

Return one of these exact country names (or "Unknown" if no clues):
United States, United Kingdom, Canada, Australia, Philippines, India, Germany, Singapore, New Zealand, Ireland, Netherlands, South Africa, United Arab Emirates, Japan, France, Spain, Brazil, Mexico

If the country is not in this list, return the closest match or the actual country name.
If there are truly no geographic clues, return "Unknown".

---

STEP 8 — Lead Scoring

Generate a lead score from 1 to 10.

Scoring guide:
10 → urgent hiring
8–9 → clearly looking for a VA
6–7 → possible hiring lead
3–5 → weak intent
1–2 → not a real lead

---

RULES

1. Only output valid JSON.
2. Do not include explanations outside JSON.
3. If information cannot be determined, return "unknown".
4. Be conservative when detecting scams but flag suspicious patterns.`;

function buildUserPrompt(input: {
  platform: string;
  author: string;
  postContent: string;
  postUrl: string;
}): string {
  return `INPUT DATA

Platform:
${input.platform}

Author:
${input.author}

Post Content:
${input.postContent}

Post URL:
${input.postUrl}

---

OUTPUT FORMAT (STRICT JSON)

{
  "isHiring": "",
  "intentCategory": "",
  "leadScore": 0,
  "urgency": "",
  "tasks": [],
  "skills": [],
  "tools": [],
  "industry": "",
  "location": "",
  "budgetEstimate": "",
  "spamRisk": "",
  "spamReason": "",
  "leadSummary": ""
}`;
}

// ---------------------------------------------------------------------------
// Parse & validate AI response
// ---------------------------------------------------------------------------

function parseAIResponse(raw: string): AIQualificationResult | null {
  try {
    // Extract JSON from potential markdown code blocks
    let jsonStr = raw.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Normalize isHiring
    let isHiring: boolean | "uncertain";
    if (parsed.isHiring === true || parsed.isHiring === "true") {
      isHiring = true;
    } else if (parsed.isHiring === false || parsed.isHiring === "false") {
      isHiring = false;
    } else {
      isHiring = "uncertain";
    }

    // Validate intentCategory
    const validIntents = ["HIGH_INTENT", "MEDIUM_INTENT", "LOW_INTENT", "NOT_RELATED"];
    const intentCategory = validIntents.includes(parsed.intentCategory)
      ? parsed.intentCategory
      : "LOW_INTENT";

    // Validate leadScore (1-10)
    const leadScore = Math.max(1, Math.min(10, Math.round(Number(parsed.leadScore) || 1)));

    // Validate urgency
    const validUrgency = ["HIGH", "MEDIUM", "LOW"];
    const urgency = validUrgency.includes(parsed.urgency) ? parsed.urgency : "LOW";

    // Validate budgetEstimate
    const validBudgets = ["hourly_low", "hourly_mid", "hourly_high", "monthly_contract", "unknown"];
    const budgetEstimate = validBudgets.includes(parsed.budgetEstimate)
      ? parsed.budgetEstimate
      : "unknown";

    // Validate spamRisk
    const validSpam = ["SAFE", "SUSPICIOUS", "LIKELY_SCAM"];
    const spamRisk = validSpam.includes(parsed.spamRisk) ? parsed.spamRisk : "SAFE";

    // Validate location — normalize "Unknown" variants
    let location = typeof parsed.location === "string" ? parsed.location.trim() : "Unknown";
    if (!location || location.toLowerCase() === "unknown" || location.toLowerCase() === "n/a") {
      location = "Unknown";
    }

    return {
      isHiring,
      intentCategory,
      leadScore,
      urgency,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
      industry: typeof parsed.industry === "string" ? parsed.industry : "unknown",
      location,
      budgetEstimate,
      spamRisk,
      spamReason: typeof parsed.spamReason === "string" ? parsed.spamReason : "",
      leadSummary: typeof parsed.leadSummary === "string" ? parsed.leadSummary : "",
    };
  } catch (err) {
    console.error("[ai-lead-qualifier] Failed to parse AI response:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Map AI result → existing scoring system
// ---------------------------------------------------------------------------

export function mapAIToScoringResult(ai: AIQualificationResult): ScoringResult {
  // Convert 1-10 AI score to 0-100 scale
  const score = Math.round(ai.leadScore * 10);

  // Map AI intent category → existing IntentLevel
  let level: IntentLevel;
  if (ai.intentCategory === "HIGH_INTENT") level = "High";
  else if (ai.intentCategory === "MEDIUM_INTENT") level = "Medium";
  else level = "Low";

  // Map to existing IntentCategory based on detected signals
  let category: IntentCategory = "Direct Hiring";
  if (ai.tasks.length > 0 && ai.tools.length > 0) {
    category = "Technical VA Request";
  } else if (ai.budgetEstimate !== "unknown") {
    category = "Budget Inquiry";
  } else if (ai.urgency === "LOW" && ai.intentCategory === "MEDIUM_INTENT") {
    category = "Recommendation Request";
  } else if (ai.intentCategory === "MEDIUM_INTENT" || ai.intentCategory === "LOW_INTENT") {
    category = "Delegation Signal";
  }

  // Build matched keywords from AI-extracted data
  const matchedKeywords: string[] = [];
  if (ai.isHiring === true) matchedKeywords.push("ai:hiring_detected");
  if (ai.urgency === "HIGH") matchedKeywords.push("ai:urgent");
  if (ai.spamRisk !== "SAFE") matchedKeywords.push(`ai:spam_${ai.spamRisk.toLowerCase()}`);
  matchedKeywords.push(...ai.tasks.slice(0, 3).map((t) => `task:${t}`));
  matchedKeywords.push(...ai.tools.slice(0, 3).map((t) => `tool:${t}`));

  return { score, level, category, matchedKeywords };
}

// ---------------------------------------------------------------------------
// Main qualification function
// ---------------------------------------------------------------------------

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
  if (genAI) return genAI;
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// ---------------------------------------------------------------------------
// Free model rotation — each model has its own rate limit quota
// When one model hits 429, we move to the next one automatically.
// ---------------------------------------------------------------------------

const FREE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

// Track which models are temporarily exhausted (cooldown per model)
const modelCooldowns = new Map<string, number>(); // model → timestamp when cooldown expires
const MODEL_COOLDOWN_MS = 60_000; // 60s cooldown after quota exhaustion

function getAvailableModels(): string[] {
  const now = Date.now();
  return FREE_MODELS.filter((m) => {
    const cooldownUntil = modelCooldowns.get(m) || 0;
    return now >= cooldownUntil;
  });
}

function markModelExhausted(model: string): void {
  modelCooldowns.set(model, Date.now() + MODEL_COOLDOWN_MS);
  console.warn(`[ai-lead-qualifier] 🚫 Model "${model}" exhausted — cooldown for ${MODEL_COOLDOWN_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES_PER_MODEL = 1; // 1 retry per model before moving to next
const RETRY_DELAY_MS = 1500;

// ---------------------------------------------------------------------------
// Single lead AI qualification — tries all available models
// ---------------------------------------------------------------------------

export async function qualifyLeadWithAI(input: {
  platform: Platform;
  author: string;
  postContent: string;
  postUrl: string;
  engagement?: number;
}): Promise<{
  aiResult: AIQualificationResult;
  scoring: ScoringResult;
} | null> {
  const ai = getGenAI();
  if (!ai) {
    console.warn("[ai-lead-qualifier] ❌ GOOGLE_AI_API_KEY not set — skipping AI qualification");
    return null;
  }

  const availableModels = getAvailableModels();
  if (availableModels.length === 0) {
    console.warn("[ai-lead-qualifier] ⏳ All models on cooldown — falling back to keyword scoring");
    return null;
  }

  console.log("[ai-lead-qualifier] ✅ Google AI Studio connected — API key detected");
  console.log(`[ai-lead-qualifier] 📝 Qualifying post by "${input.author}" on ${input.platform}`);
  console.log(`[ai-lead-qualifier] 📄 Post preview: "${input.postContent.slice(0, 120)}..."`);
  console.log(`[ai-lead-qualifier] 🔄 Available models: [${availableModels.join(", ")}]`);

  const userPrompt = buildUserPrompt({
    platform: input.platform,
    author: input.author,
    postContent: input.postContent,
    postUrl: input.postUrl,
  });

  const prompt = SYSTEM_PROMPT + "\n\n" + userPrompt;

  // Try each available model in order
  for (const modelName of availableModels) {
    console.log(`[ai-lead-qualifier] 🚀 Trying model: ${modelName}...`);

    const model = ai.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[ai-lead-qualifier] 🔁 Retry ${attempt}/${MAX_RETRIES_PER_MODEL} on ${modelName}...`);
          await sleep(RETRY_DELAY_MS);
        }

        const startTime = Date.now();
        const result = await model.generateContent(prompt);
        const elapsed = Date.now() - startTime;
        const responseText = result.response.text();

        console.log(`[ai-lead-qualifier] ⏱️ ${modelName} responded in ${elapsed}ms`);
        console.log("[ai-lead-qualifier] ✅ Gemini response received — parsing JSON...");
        console.log("[ai-lead-qualifier] 📦 Raw response:", responseText.slice(0, 300));

        const aiResult = parseAIResponse(responseText);
        if (!aiResult) {
          console.error(`[ai-lead-qualifier] ❌ Failed to parse response from ${modelName}`);
          break; // bad response, try next model
        }

        const scoring = mapAIToScoringResult(aiResult);

        console.log(`[ai-lead-qualifier] ✅ AI qualification complete (via ${modelName}):`);
        console.log(`  📊 Lead Score: ${aiResult.leadScore}/10 (mapped to ${scoring.score}/100)`);
        console.log(`  🎯 Intent: ${aiResult.intentCategory} → Level: ${scoring.level}`);
        console.log(`  ⚡ Urgency: ${aiResult.urgency}`);
        console.log(`  🛡️ Spam Risk: ${aiResult.spamRisk}${aiResult.spamReason ? ` — ${aiResult.spamReason}` : ""}`);
        console.log(`  👤 Hiring: ${aiResult.isHiring}`);
        console.log(`  💼 Tasks: [${aiResult.tasks.join(", ")}]`);
        console.log(`  🔧 Tools: [${aiResult.tools.join(", ")}]`);
        console.log(`  🌍 Location: ${aiResult.location}`);
        console.log(`  🏢 Industry: ${aiResult.industry}`);
        console.log(`  💰 Budget: ${aiResult.budgetEstimate}`);
        console.log(`  📝 Summary: ${aiResult.leadSummary}`);

        return { aiResult, scoring };
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;

        if (status === 429 || status === 503) {
          if (attempt < MAX_RETRIES_PER_MODEL) {
            console.warn(`[ai-lead-qualifier] ⚠️ ${modelName} rate limited (${status}) — retrying...`);
            continue;
          }
          // Model exhausted, mark cooldown and try next model
          markModelExhausted(modelName);
          break;
        }

        // Non-rate-limit error — log and try next model
        console.error(`[ai-lead-qualifier] ❌ ${modelName} error:`, (err as Error).message || err);
        break;
      }
    }
  }

  console.error("[ai-lead-qualifier] ❌ All models failed — falling back to keyword scoring");
  return null;
}

// ---------------------------------------------------------------------------
// Hybrid scoring: AI-first with keyword fallback (single lead)
// ---------------------------------------------------------------------------

export interface QualifyResult {
  scoring: ScoringResult;
  aiResult: AIQualificationResult | null;
  source: "ai" | "keyword";
}

export async function qualifyLead(input: {
  platform: Platform;
  author: string;
  text: string;
  url: string;
  engagement: number;
}): Promise<QualifyResult> {
  console.log(`[ai-lead-qualifier] 🔄 Starting qualification for "${input.author}" (${input.platform})`);

  const aiQualification = await qualifyLeadWithAI({
    platform: input.platform,
    author: input.author,
    postContent: input.text,
    postUrl: input.url,
    engagement: input.engagement,
  });

  if (aiQualification) {
    console.log(`[ai-lead-qualifier] ✅ Used AI scoring — Score: ${aiQualification.scoring.score}/100`);
    return {
      scoring: aiQualification.scoring,
      aiResult: aiQualification.aiResult,
      source: "ai",
    };
  }

  // Fallback to keyword-based scoring
  console.log("[ai-lead-qualifier] ⚠️ AI unavailable — falling back to keyword scoring");
  const scoring = scoreIntent({
    text: input.text,
    engagement: input.engagement,
    platform: input.platform,
  });
  console.log(`[ai-lead-qualifier] 📊 Keyword score: ${scoring.score}/100 (${scoring.level})`);

  return { scoring, aiResult: null, source: "keyword" };
}

// ---------------------------------------------------------------------------
// Batch qualification — rate-limited chunks (handles 100–500+ leads)
//
// Processes CHUNK_SIZE leads concurrently, then waits CHUNK_DELAY_MS before
// the next chunk. Each individual call retries on 429 with backoff.
// If AI fails for any lead, that lead falls back to keyword scoring.
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 5;          // concurrent AI calls per chunk
const CHUNK_DELAY_MS = 1500;   // pause between chunks to stay under rate limits

export async function qualifyLeadsBatch(
  inputs: Array<{
    platform: Platform;
    author: string;
    text: string;
    url: string;
    engagement: number;
  }>
): Promise<QualifyResult[]> {
  const results: QualifyResult[] = new Array(inputs.length);
  const totalChunks = Math.ceil(inputs.length / CHUNK_SIZE);

  console.log(
    `[ai-lead-qualifier] Batch: ${inputs.length} leads in ${totalChunks} chunks (${CHUNK_SIZE}/chunk, ${CHUNK_DELAY_MS}ms delay)`
  );

  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
    const chunk = inputs.slice(i, i + CHUNK_SIZE);

    console.log(`[ai-lead-qualifier] Chunk ${chunkIndex}/${totalChunks} — ${chunk.length} leads`);

    // Process chunk concurrently
    const chunkResults = await Promise.all(
      chunk.map((input) => qualifyLead(input))
    );

    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
    }

    const aiCount = chunkResults.filter((r) => r.source === "ai").length;
    const kwCount = chunkResults.filter((r) => r.source === "keyword").length;
    console.log(
      `[ai-lead-qualifier] Chunk ${chunkIndex} done — AI: ${aiCount}, Keyword fallback: ${kwCount}`
    );

    // Delay between chunks (skip after the last one)
    if (i + CHUNK_SIZE < inputs.length) {
      await sleep(CHUNK_DELAY_MS);
    }
  }

  return results;
}
