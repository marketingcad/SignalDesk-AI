import { describe, it, expect } from "vitest";
import { scoreIntent } from "./intent-scoring";

describe("scoreIntent", () => {
  // ── High Intent ──────────────────────────────────────────────

  it("scores direct hiring phrase as positive", () => {
    const result = scoreIntent({
      text: "Looking for a virtual assistant to manage my inbox",
      engagement: 0,
      platform: "Facebook",
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.category).toBe("Direct Hiring");
    expect(result.matchedKeywords).toContain("looking for a virtual assistant");
  });

  it("reaches High intent with multiple hiring signals", () => {
    const result = scoreIntent({
      text: "Looking for a virtual assistant to manage my inbox, need a VA ASAP for email marketing and data entry",
      engagement: 10,
      platform: "Facebook",
    });
    expect(result.level).toBe("High");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("scores multiple hiring signals cumulatively", () => {
    const result = scoreIntent({
      text: "Hiring a VA urgently, need someone ASAP for data entry and email marketing",
      engagement: 10,
      platform: "Reddit",
    });
    expect(result.level).toBe("High");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.matchedKeywords.length).toBeGreaterThan(2);
  });

  it("gives engagement bonus for high engagement", () => {
    const withoutEngagement = scoreIntent({
      text: "Need a VA for my Shopify store",
      engagement: 0,
      platform: "Facebook",
    });
    const withEngagement = scoreIntent({
      text: "Need a VA for my Shopify store",
      engagement: 10,
      platform: "Facebook",
    });
    expect(withEngagement.score).toBeGreaterThan(withoutEngagement.score);
  });

  it("gives country match bonus", () => {
    const withoutCountry = scoreIntent({
      text: "Hiring a VA for admin work",
      engagement: 0,
      platform: "LinkedIn",
    });
    const withCountry = scoreIntent({
      text: "Hiring a VA for admin work, US-based preferred",
      engagement: 0,
      platform: "LinkedIn",
    });
    expect(withCountry.score).toBeGreaterThan(withoutCountry.score);
  });

  // ── Medium Intent ────────────────────────────────────────────

  it("scores recommendation requests as Medium", () => {
    const result = scoreIntent({
      text: "Any VA recommendations? Thinking of hiring one for my business",
      engagement: 0,
      platform: "Reddit",
    });
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.matchedKeywords).toContain("any va recommendations");
  });

  it("scores budget inquiries as Medium", () => {
    const result = scoreIntent({
      text: "How much does a VA cost these days?",
      engagement: 0,
      platform: "Facebook",
    });
    expect(result.matchedKeywords).toContain("how much does a va cost");
    expect(result.category).toBe("Budget Inquiry");
  });

  // ── Negative Signals ─────────────────────────────────────────

  it("penalizes job seeker posts", () => {
    const result = scoreIntent({
      text: "I'm a virtual assistant with 5 years experience, hire me",
      engagement: 0,
      platform: "Reddit",
    });
    expect(result.score).toBeLessThan(50);
    expect(result.matchedKeywords).toContain("i'm a virtual assistant");
    expect(result.matchedKeywords).toContain("hire me");
  });

  it("penalizes [FOR HIRE] posts", () => {
    const result = scoreIntent({
      text: "[FOR HIRE] Experienced VA offering admin support and data entry",
      engagement: 0,
      platform: "Reddit",
    });
    expect(result.score).toBeLessThan(50);
  });

  it("penalizes self-promotion posts", () => {
    const result = scoreIntent({
      text: "I provide VA services including social media management. DM me for rates.",
      engagement: 0,
      platform: "Facebook",
    });
    expect(result.score).toBeLessThan(50);
  });

  // ── Edge Cases ───────────────────────────────────────────────

  it("scores 0 for irrelevant text", () => {
    const result = scoreIntent({
      text: "The weather is nice today",
      engagement: 0,
      platform: "X",
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe("Low");
    expect(result.matchedKeywords).toHaveLength(0);
  });

  it("caps score at 100", () => {
    const result = scoreIntent({
      text: "Hiring a virtual assistant, need a VA ASAP, urgently hiring remote assistant for Shopify, need someone for data entry and customer service, US-based",
      engagement: 20,
      platform: "Facebook",
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("floors score at 0", () => {
    const result = scoreIntent({
      text: "I'm a virtual assistant offering va services, hire me, dm me, available for hire, open for clients, freelance va here",
      engagement: 0,
      platform: "Reddit",
    });
    expect(result.score).toBe(0);
  });

  // ── Dynamic Config ───────────────────────────────────────────

  it("uses custom thresholds when provided", () => {
    const result = scoreIntent(
      { text: "Need a VA for my business", engagement: 0, platform: "Facebook" },
      { highThreshold: 30, mediumThreshold: 10 }
    );
    expect(result.level).toBe("High");
  });
});
