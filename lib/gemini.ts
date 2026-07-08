import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Shared Google Gemini client + free-model rotation
//
// Extracted from ai-lead-qualifier.ts so every caller (lead qualification,
// outreach drafts, keyword discovery…) shares ONE client, model list, and
// cooldown map. When a model hits its per-model quota (429) we cool it down and
// move to the next, instead of each feature tracking exhaustion separately.
// ---------------------------------------------------------------------------

let genAI: GoogleGenerativeAI | null = null;

export function getGenAI(): GoogleGenerativeAI | null {
  if (genAI) return genAI;
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// Live free-tier models (verified via ListModels). These are "thinking" models —
// leave generous maxOutputTokens headroom or the response truncates
// (finishReason: MAX_TOKENS → unparseable).
export const FREE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
];

// Per-model cooldown: model → timestamp when it becomes usable again.
const modelCooldowns = new Map<string, number>();
const MODEL_COOLDOWN_MS = 60_000; // 60s cooldown after quota exhaustion

export function getAvailableModels(): string[] {
  const now = Date.now();
  return FREE_MODELS.filter((m) => (modelCooldowns.get(m) || 0) <= now);
}

export function markModelExhausted(model: string): void {
  modelCooldowns.set(model, Date.now() + MODEL_COOLDOWN_MS);
  console.warn(
    `[gemini] 🚫 Model "${model}" exhausted — cooldown for ${MODEL_COOLDOWN_MS / 1000}s`
  );
}

// ---------------------------------------------------------------------------
// generateText — simple text generation with automatic model rotation.
//
// Tries each available model in order. On 429/503 the model is cooled down and
// the next is tried. Returns the response text, or null if every model is
// unavailable/exhausted (callers should degrade gracefully).
// ---------------------------------------------------------------------------

export async function generateText(
  prompt: string,
  opts?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  }
): Promise<string | null> {
  const ai = getGenAI();
  if (!ai) {
    console.warn("[gemini] ❌ GOOGLE_AI_API_KEY not set — skipping generation");
    return null;
  }

  const models = getAvailableModels();
  if (models.length === 0) {
    console.warn("[gemini] ⏳ All models on cooldown");
    return null;
  }

  for (const modelName of models) {
    try {
      const model = ai.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: opts?.temperature ?? 0.7,
          maxOutputTokens: opts?.maxOutputTokens ?? 1024,
          ...(opts?.responseMimeType
            ? { responseMimeType: opts.responseMimeType }
            : {}),
        },
      });

      const result = await model.generateContent(prompt);

      // Thinking tokens share the maxOutputTokens budget. When they eat it all,
      // finishReason is MAX_TOKENS and .text() silently returns a reply cut
      // mid-word. Never let that pass unnoticed — raise the caller's budget.
      const finishReason = result.response.candidates?.[0]?.finishReason;
      if (finishReason === "MAX_TOKENS") {
        const thoughts = (result.response.usageMetadata as { thoughtsTokenCount?: number } | undefined)
          ?.thoughtsTokenCount;
        console.warn(
          `[gemini] ⚠️  ${modelName} hit MAX_TOKENS (thinking used ${thoughts ?? "?"} tok of ` +
            `${opts?.maxOutputTokens ?? 1024}) — output is TRUNCATED. Increase maxOutputTokens.`
        );
      }

      return result.response.text();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 || status === 503) {
        markModelExhausted(modelName);
        continue; // try next model
      }
      console.error(
        `[gemini] ❌ ${modelName} error:`,
        (err as Error).message || err
      );
      continue;
    }
  }

  console.error("[gemini] ❌ All models failed");
  return null;
}
