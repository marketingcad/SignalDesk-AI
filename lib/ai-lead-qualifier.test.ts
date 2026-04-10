import { describe, it, expect } from "vitest";
import { mapAIToScoringResult } from "./ai-lead-qualifier";
import type { AIQualificationResult } from "./types";

// parseAIResponse is not exported, so we test it indirectly via valid/invalid AI responses.
// mapAIToScoringResult IS exported and is the key transformation function.

function makeAIResult(overrides: Partial<AIQualificationResult> = {}): AIQualificationResult {
  return {
    isHiring: true,
    intentCategory: "HIGH_INTENT",
    leadScore: 8,
    urgency: "HIGH",
    tasks: ["email management", "data entry"],
    skills: ["communication", "organization"],
    tools: ["Shopify", "GoHighLevel"],
    industry: "E-commerce",
    location: "Philippines",
    budgetEstimate: "hourly_mid",
    spamRisk: "SAFE",
    spamReason: "",
    leadSummary: "Business owner looking for VA to manage Shopify store",
    ...overrides,
  };
}

describe("mapAIToScoringResult", () => {
  // ── Score mapping ────────────────────────────────────────────

  it("converts leadScore 1-10 to 0-100 scale", () => {
    expect(mapAIToScoringResult(makeAIResult({ leadScore: 10 })).score).toBe(100);
    expect(mapAIToScoringResult(makeAIResult({ leadScore: 5 })).score).toBe(50);
    expect(mapAIToScoringResult(makeAIResult({ leadScore: 1 })).score).toBe(10);
    expect(mapAIToScoringResult(makeAIResult({ leadScore: 8 })).score).toBe(80);
  });

  // ── Intent level mapping ─────────────────────────────────────

  it("maps HIGH_INTENT to High", () => {
    expect(mapAIToScoringResult(makeAIResult({ intentCategory: "HIGH_INTENT" })).level).toBe("High");
  });

  it("maps MEDIUM_INTENT to Medium", () => {
    expect(mapAIToScoringResult(makeAIResult({ intentCategory: "MEDIUM_INTENT" })).level).toBe("Medium");
  });

  it("maps LOW_INTENT to Low", () => {
    expect(mapAIToScoringResult(makeAIResult({ intentCategory: "LOW_INTENT" })).level).toBe("Low");
  });

  it("maps NOT_RELATED to Low", () => {
    expect(mapAIToScoringResult(makeAIResult({ intentCategory: "NOT_RELATED" })).level).toBe("Low");
  });

  // ── Category mapping ─────────────────────────────────────────

  it("maps to Technical VA Request when tasks + tools present", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: ["email management"],
      tools: ["GoHighLevel"],
    }));
    expect(result.category).toBe("Technical VA Request");
  });

  it("maps to Budget Inquiry when budget is known", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: [],
      tools: [],
      budgetEstimate: "hourly_mid",
    }));
    expect(result.category).toBe("Budget Inquiry");
  });

  it("maps to Recommendation Request for low urgency medium intent", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: [],
      tools: [],
      budgetEstimate: "unknown",
      urgency: "LOW",
      intentCategory: "MEDIUM_INTENT",
    }));
    expect(result.category).toBe("Recommendation Request");
  });

  it("maps to Delegation Signal for medium/low intent with unknown budget", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: [],
      tools: [],
      budgetEstimate: "unknown",
      urgency: "MEDIUM",
      intentCategory: "MEDIUM_INTENT",
    }));
    expect(result.category).toBe("Delegation Signal");
  });

  it("defaults to Direct Hiring for high intent", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: [],
      tools: [],
      budgetEstimate: "unknown",
      intentCategory: "HIGH_INTENT",
    }));
    expect(result.category).toBe("Direct Hiring");
  });

  // ── Matched keywords ─────────────────────────────────────────

  it("includes hiring signal in matchedKeywords", () => {
    const result = mapAIToScoringResult(makeAIResult({ isHiring: true }));
    expect(result.matchedKeywords).toContain("ai:hiring_detected");
  });

  it("includes urgency in matchedKeywords", () => {
    const result = mapAIToScoringResult(makeAIResult({ urgency: "HIGH" }));
    expect(result.matchedKeywords).toContain("ai:urgent");
  });

  it("includes spam flag in matchedKeywords", () => {
    const result = mapAIToScoringResult(makeAIResult({ spamRisk: "SUSPICIOUS" }));
    expect(result.matchedKeywords).toContain("ai:spam_suspicious");
  });

  it("includes task and tool prefixes", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: ["email management", "scheduling"],
      tools: ["Shopify"],
    }));
    expect(result.matchedKeywords).toContain("task:email management");
    expect(result.matchedKeywords).toContain("task:scheduling");
    expect(result.matchedKeywords).toContain("tool:Shopify");
  });

  it("limits tasks and tools to 3 each", () => {
    const result = mapAIToScoringResult(makeAIResult({
      tasks: ["t1", "t2", "t3", "t4", "t5"],
      tools: ["tool1", "tool2", "tool3", "tool4"],
    }));
    const taskKeywords = result.matchedKeywords.filter((k) => k.startsWith("task:"));
    const toolKeywords = result.matchedKeywords.filter((k) => k.startsWith("tool:"));
    expect(taskKeywords).toHaveLength(3);
    expect(toolKeywords).toHaveLength(3);
  });
});
