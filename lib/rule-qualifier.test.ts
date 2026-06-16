import { describe, it, expect } from "vitest";
import { qualifyLeadWithRules, looksLikeEmployerHiring } from "./rule-qualifier";
import { HIRING_KEYWORDS, SEEKING_KEYWORDS } from "./keywords";

const run = (text: string) =>
  qualifyLeadWithRules({ platform: "Facebook", text }, HIRING_KEYWORDS, SEEKING_KEYWORDS);

describe("qualifyLeadWithRules (AI fallback)", () => {
  it("keeps the real missed lead the strict gate dropped (Googly VA)", () => {
    // The exact post that was dropped during the run investigation — it reads as
    // a clear hire but has no exact keyword substring, so strict matching missed it.
    const r = run(
      "🚨 WE'RE HIRING: AUTOMATION & GHL VA 🚨 Are you a GoHighLevel expert " +
        "looking for your next opportunity? We're specifically looking for someone " +
        "who is HIGHLY PROFICIENT in GoHighLevel (GHL) and has experience building " +
        "automations, workflows, funnels, and AI systems. Long-term remote role."
    );
    expect(r.isHiring).toBe(true);
    expect(r.intentCategory).not.toBe("NOT_RELATED");
    expect(r.leadScore).toBeGreaterThanOrEqual(6);
    expect(r.tools).toContain("gohighlevel");
  });

  it("flags a clear direct hire", () => {
    const r = run("Hi everyone! I'm hiring a remote virtual assistant for my business long-term.");
    expect(r.isHiring).toBe(true);
    expect(r.intentCategory).not.toBe("NOT_RELATED");
  });

  it("rejects a VA self-promo / job seeker", () => {
    const r = run(
      "I'm a virtual assistant offering VA services. Hire me! DM me for rates. Available for hire."
    );
    expect(r.isHiring).toBe(false);
    expect(r.intentCategory).toBe("NOT_RELATED");
    expect(r.spamRisk).toBe("SUSPICIOUS");
  });

  it("rejects spam/MLM as LIKELY_SCAM", () => {
    const r = run("Earn $5000/week! Work from home opportunity. Be your own boss with unlimited income.");
    expect(r.intentCategory).toBe("NOT_RELATED");
    expect(r.spamRisk).toBe("LIKELY_SCAM");
    expect(r.leadScore).toBe(1);
  });

  it("returns uncertain/NOT_RELATED for irrelevant text", () => {
    const r = run("The weather is lovely today and the coffee is great.");
    expect(r.isHiring).toBe("uncertain");
    expect(r.intentCategory).toBe("NOT_RELATED");
  });

  it("always returns a full AIQualificationResult shape", () => {
    const r = run("need a va for shopify and data entry, $15/hr remote");
    expect(r).toHaveProperty("isHiring");
    expect(r).toHaveProperty("intentCategory");
    expect(r).toHaveProperty("leadScore");
    expect(r).toHaveProperty("location");
    expect(r).toHaveProperty("spamRisk");
    expect(r.budgetEstimate).toBe("hourly_mid"); // $15/hr → mid
    expect(r.leadSummary).toContain("[rule-based fallback]");
  });
});

describe("looksLikeEmployerHiring (AI-miss safety net)", () => {
  it("rescues a clear hire the AI may reject for 'NOT a typical VA role'", () => {
    // The exact Emily-style post the live AI dropped during the prod test.
    expect(
      looksLikeEmployerHiring(
        "🚨 WE'RE HIRING | Creative Marketing/Design & Funnel Systems Specialist " +
          "(GHL Expert). We're looking for an exceptional person to join our team " +
          "long-term. This is NOT a typical VA role. Send your resume to apply."
      )
    ).toBe(true);
  });

  it("does NOT fire on discussion questions (Aref-style false positive)", () => {
    expect(
      looksLikeEmployerHiring(
        "Quick question for the GHL pros in here… Has anyone built a clean UTM tracking setup?"
      )
    ).toBe(false);
  });

  it("does NOT fire on a support/troubleshooting complaint (Peter-style)", () => {
    expect(
      looksLikeEmployerHiring(
        "What is going on today..... The help tool won't open and no automation is working."
      )
    ).toBe(false);
  });

  it("does NOT fire on a VA self-promo even if it says 'hire me'", () => {
    expect(
      looksLikeEmployerHiring(
        "I'm a virtual assistant available for hire — DM me for rates. Hire me!"
      )
    ).toBe(false);
  });

  it("does NOT fire on spam/MLM", () => {
    expect(
      looksLikeEmployerHiring("We're hiring! Earn $5000/week, be your own boss, unlimited income.")
    ).toBe(false);
  });
});
