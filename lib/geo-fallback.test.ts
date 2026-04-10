import { describe, it, expect } from "vitest";
import { inferLocationFromText } from "./geo-fallback";

describe("inferLocationFromText", () => {
  // ── Priority 1: Author Location ──────────────────────────────

  it("prioritizes author location", () => {
    expect(inferLocationFromText("Some random text", "source", "Manila, Philippines")).toBe("Philippines");
    expect(inferLocationFromText("US company", "source", "Mumbai, India")).toBe("India");
  });

  // ── Priority 2: Language ─────────────────────────────────────

  it("infers Philippines from Tagalog language", () => {
    expect(inferLocationFromText("Text", "source", undefined, "tl")).toBe("Philippines");
    expect(inferLocationFromText("Text", "source", undefined, "fil")).toBe("Philippines");
    expect(inferLocationFromText("Text", "source", undefined, "ceb")).toBe("Philippines");
  });

  it("infers India from Indian languages", () => {
    expect(inferLocationFromText("Text", "source", undefined, "hi")).toBe("India");
    expect(inferLocationFromText("Text", "source", undefined, "ta")).toBe("India");
    expect(inferLocationFromText("Text", "source", undefined, "bn")).toBe("India");
  });

  // ── Priority 3: Source ───────────────────────────────────────

  it("infers from community/source name", () => {
    expect(inferLocationFromText("Hiring a VA", "Philippines VA Group")).toBe("Philippines");
    expect(inferLocationFromText("Hiring a VA", "Australian Business Network")).toBe("Australia");
  });

  it("skips generic source names", () => {
    expect(inferLocationFromText("Hiring a VA", "X Feed")).toBeNull();
    expect(inferLocationFromText("Hiring a VA", "LinkedIn Feed")).toBeNull();
    expect(inferLocationFromText("Hiring a VA", "Reddit")).toBeNull();
  });

  // ── Priority 4: Text Content ─────────────────────────────────

  it("infers Philippines from text", () => {
    expect(inferLocationFromText("Looking for a Filipino VA", "source")).toBe("Philippines");
    expect(inferLocationFromText("Manila-based assistant needed", "source")).toBe("Philippines");
  });

  it("infers India from text", () => {
    expect(inferLocationFromText("Need VA from India for data entry", "source")).toBe("India");
    expect(inferLocationFromText("Bangalore-based virtual assistant", "source")).toBe("India");
  });

  it("infers United Kingdom from text", () => {
    expect(inferLocationFromText("UK-based VA needed", "source")).toBe("United Kingdom");
    expect(inferLocationFromText("Looking for London VA", "source")).toBe("United Kingdom");
  });

  it("infers Australia from text", () => {
    expect(inferLocationFromText("Australian VA wanted", "source")).toBe("Australia");
    expect(inferLocationFromText("Sydney-based assistant", "source")).toBe("Australia");
  });

  it("infers United States from text", () => {
    expect(inferLocationFromText("USA-based VA preferred", "source")).toBe("United States");
    expect(inferLocationFromText("California virtual assistant", "source")).toBe("United States");
    expect(inferLocationFromText("Need someone in New York timezone", "source")).toBe("United States");
  });

  // ── No match ─────────────────────────────────────────────────

  it("returns null when no location detected", () => {
    expect(inferLocationFromText("Hiring a VA for my business", "source")).toBeNull();
    expect(inferLocationFromText("Need help with admin tasks", "source")).toBeNull();
  });

  // ── Priority order ───────────────────────────────────────────

  it("author location overrides text content", () => {
    expect(inferLocationFromText("Looking for a VA in India", "source", "London, UK")).toBe("United Kingdom");
  });

  it("language overrides source and text", () => {
    expect(inferLocationFromText("US company needs VA", "Australian Group", undefined, "tl")).toBe("Philippines");
  });
});
