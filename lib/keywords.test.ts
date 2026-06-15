import { describe, it, expect } from "vitest";
import { classifyText, matchKeywords, HIRING_KEYWORDS, SEEKING_KEYWORDS } from "./keywords";

describe("classifyText", () => {
  // ── Hiring Detection ─────────────────────────────────────────

  it("detects direct hiring posts", () => {
    expect(classifyText("Looking for a virtual assistant for my business")).toBe("HIRING_VA");
    expect(classifyText("Hiring a VA for my Shopify store")).toBe("HIRING_VA");
    expect(classifyText("Need a VA to manage my inbox")).toBe("HIRING_VA");
  });

  it("detects recommendation requests as hiring", () => {
    expect(classifyText("Can anyone recommend a VA?")).toBe("HIRING_VA");
    expect(classifyText("Where to hire a VA?")).toBe("HIRING_VA");
  });

  it("detects tool-specific hiring", () => {
    expect(classifyText("Need VA for GoHighLevel setup")).toBe("HIRING_VA");
    expect(classifyText("Hiring shopify VA for my store")).toBe("HIRING_VA");
  });

  // ── Job Seeker Detection ─────────────────────────────────────

  it("detects self-identification as seeking", () => {
    expect(classifyText("I'm a virtual assistant with 5 years experience")).toBe("SEEKING_WORK");
    expect(classifyText("I am a VA specializing in admin work")).toBe("SEEKING_WORK");
  });

  it("detects service offers as seeking", () => {
    expect(classifyText("Offering VA services for small businesses")).toBe("SEEKING_WORK");
    expect(classifyText("Hire me for your admin tasks")).toBe("SEEKING_WORK");
    expect(classifyText("DM me for rates and availability")).toBe("SEEKING_WORK");
  });

  it("detects [FOR HIRE] tags as seeking", () => {
    expect(classifyText("[FOR HIRE] Experienced VA available")).toBe("SEEKING_WORK");
  });

  // ── Seeking takes priority over hiring ───────────────────────

  it("classifies mixed posts as SEEKING (seeking takes priority)", () => {
    // A VA advertising services but mentioning hiring keywords
    expect(classifyText("I'm a virtual assistant, hire me for your data entry needs")).toBe("SEEKING_WORK");
    expect(classifyText("Looking for work as a VA, I can help with your Shopify store")).toBe("SEEKING_WORK");
  });

  // ── No match ─────────────────────────────────────────────────

  it("returns null for irrelevant text", () => {
    expect(classifyText("The stock market is up today")).toBeNull();
    expect(classifyText("Nice weather we're having")).toBeNull();
    expect(classifyText("")).toBeNull();
  });

  // ── Case insensitive ─────────────────────────────────────────

  it("is case insensitive", () => {
    expect(classifyText("HIRING A VA")).toBe("HIRING_VA");
    expect(classifyText("I'M A VIRTUAL ASSISTANT")).toBe("SEEKING_WORK");
  });

  // ── Constants sanity checks ──────────────────────────────────

  it("HIRING_KEYWORDS has expected entries", () => {
    expect(HIRING_KEYWORDS.length).toBeGreaterThan(50);
    expect(HIRING_KEYWORDS).toContain("looking for a virtual assistant");
    expect(HIRING_KEYWORDS).toContain("hiring a va");
    expect(HIRING_KEYWORDS).toContain("[hiring]");
  });

  it("SEEKING_KEYWORDS has expected entries", () => {
    expect(SEEKING_KEYWORDS.length).toBeGreaterThan(20);
    expect(SEEKING_KEYWORDS).toContain("hire me");
    expect(SEEKING_KEYWORDS).toContain("dm me");
    expect(SEEKING_KEYWORDS).toContain("[for hire]");
  });
});

describe("matchKeywords (shared fuzzy matcher)", () => {
  it("matches exact substrings", () => {
    expect(matchKeywords("we are hiring a va for our store", ["hiring a va"])).toContain("hiring a va");
  });

  it("is case insensitive", () => {
    expect(matchKeywords("HIRING A VA NOW", ["hiring a va"])).toContain("hiring a va");
  });

  it("fuzzy-matches real leads with slightly different wording", () => {
    // Regression: the real lead that the strict substring gate wrongly dropped.
    // "Looking for VA" should match the keyword "looking for a va" (missing "a").
    const text = "A client reached out. Looking for VA. Looking for NDIS/Australian VA.";
    expect(matchKeywords(text, ["looking for a va"])).toContain("looking for a va");
  });

  it("does not fuzzy-match unrelated text", () => {
    expect(matchKeywords("the weather is nice today", ["looking for a va"])).toEqual([]);
    expect(matchKeywords("", ["hiring a va"])).toEqual([]);
  });

  it("requires >=70% of significant words for a fuzzy match", () => {
    // Only "looking" present out of {looking, for, virtual, assistant} → no match.
    expect(matchKeywords("looking at the sunset", ["looking for a virtual assistant"])).toEqual([]);
  });

  it("returns every matching keyword from the list", () => {
    const matched = matchKeywords("hiring a va and need admin support", [
      "hiring a va",
      "need admin support",
      "hiring shopify va",
    ]);
    expect(matched).toContain("hiring a va");
    expect(matched).toContain("need admin support");
    expect(matched).not.toContain("hiring shopify va");
  });
});
