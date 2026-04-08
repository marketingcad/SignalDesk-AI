import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCachedKeywords } from "../api/backendClient";

// Mock backendClient before importing postFilter
vi.mock("../api/backendClient", () => ({
  getCachedKeywords: vi.fn(() => null),
}));

import { isJobSeeker, filterPosts, deduplicatePosts } from "./postFilter";
import type { ScrapedPost } from "../types";

const mockGetCachedKeywords = getCachedKeywords as ReturnType<typeof vi.fn>;

/** Simulate keywords loaded from /settings page */
function setNegativeKeywords(keywords: string[]) {
  mockGetCachedKeywords.mockReturnValue({
    searchQueries: [],
    negativeKeywords: keywords,
    scoringConfig: { high_intent: [], medium_intent: [], negative: keywords },
  });
}

function makePost(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
  return {
    platform: "Facebook",
    author: "Test User",
    text: "Looking to hire a virtual assistant for my ecommerce store",
    url: "https://facebook.com/groups/test/posts/123",
    timestamp: new Date().toISOString(),
    engagement: 5,
    source: "test",
    ...overrides,
  };
}

describe("isJobSeeker", () => {
  beforeEach(() => {
    // Simulate the default negative keywords from /settings (mirrors SEEKING_KEYWORDS)
    setNegativeKeywords([
      "i'm a virtual assistant",
      "i am a virtual assistant",
      "i'm a va",
      "i am a va",
      "freelance va here",
      "offering va services",
      "i provide va services",
      "hire me",
      "va available",
      "available for hire",
      "open for clients",
      "looking for work",
      "looking for clients",
      "looking for va work",
      "looking for a va job",
      "i will be your virtual assistant",
      "i can be your va",
      "my services include",
      "services i offer",
      "dm me",
      "dm for rates",
      "[for hire]",
      "years of experience",
      "share my resume",
    ]);
  });

  it("rejects 'I am a virtual assistant'", () => {
    expect(isJobSeeker("I am a virtual assistant with 5 years of experience")).toBe(true);
  });

  it("rejects 'hire me'", () => {
    expect(isJobSeeker("Looking for clients — hire me for VA work")).toBe(true);
  });

  it("rejects '[FOR HIRE]' tags", () => {
    expect(isJobSeeker("[FOR HIRE] Experienced VA available")).toBe(true);
  });

  it("rejects 'dm me'", () => {
    expect(isJobSeeker("DM me for rates and availability")).toBe(true);
  });

  it("rejects 'years of experience' (resume language)", () => {
    expect(isJobSeeker("I have 3 years of experience as a VA")).toBe(true);
  });

  it("rejects 'looking for work'", () => {
    expect(isJobSeeker("I'm looking for work as a virtual assistant")).toBe(true);
  });

  it("rejects 'offering va services'", () => {
    expect(isJobSeeker("Offering VA services for small businesses")).toBe(true);
  });

  it("rejects 'available for hire'", () => {
    expect(isJobSeeker("I'm available for hire — VA with data entry skills")).toBe(true);
  });

  it("accepts genuine hiring posts", () => {
    expect(isJobSeeker("Looking to hire a VA for my Shopify store")).toBe(false);
  });

  it("accepts recommendation requests", () => {
    expect(isJobSeeker("Can anyone recommend a good virtual assistant?")).toBe(false);
  });

  it("accepts budget inquiry posts", () => {
    expect(isJobSeeker("How much does a virtual assistant cost per hour?")).toBe(false);
  });

  it("accepts delegation signal posts", () => {
    expect(isJobSeeker("I'm overwhelmed with admin tasks and need help")).toBe(false);
  });

  it("does not filter when no keywords are loaded", () => {
    mockGetCachedKeywords.mockReturnValue(null);
    expect(isJobSeeker("I am a virtual assistant")).toBe(false);
  });

  it("matches custom keywords from settings", () => {
    setNegativeKeywords(["book a discovery call", "accepting new clients"]);
    expect(isJobSeeker("Book a discovery call with me today!")).toBe(true);
    expect(isJobSeeker("Looking to hire a VA")).toBe(false);
  });
});

describe("filterPosts", () => {
  beforeEach(() => {
    setNegativeKeywords(["i am a virtual assistant", "hire me"]);
  });

  it("removes posts shorter than min length", () => {
    const posts = [makePost({ text: "short" })];
    expect(filterPosts(posts)).toHaveLength(0);
  });

  it("removes job seeker posts", () => {
    const posts = [makePost({ text: "I am a virtual assistant, hire me for your business" })];
    expect(filterPosts(posts)).toHaveLength(0);
  });

  it("keeps valid hiring posts", () => {
    const posts = [makePost({ text: "Looking to hire a virtual assistant for my ecommerce store ASAP" })];
    expect(filterPosts(posts)).toHaveLength(1);
  });

  it("deduplicates by URL within the same batch", () => {
    const posts = [
      makePost({ url: "https://facebook.com/posts/123" }),
      makePost({ url: "https://facebook.com/posts/123?ref=share" }),
    ];
    expect(filterPosts(posts)).toHaveLength(1);
  });

  it("keeps posts with different URLs", () => {
    const posts = [
      makePost({ url: "https://facebook.com/posts/123" }),
      makePost({ url: "https://facebook.com/posts/456" }),
    ];
    expect(filterPosts(posts)).toHaveLength(2);
  });
});

describe("deduplicatePosts", () => {
  it("removes duplicate URLs", () => {
    const posts = [
      makePost({ url: "https://reddit.com/r/test/comments/abc" }),
      makePost({ url: "https://reddit.com/r/test/comments/abc/" }),
    ];
    expect(deduplicatePosts(posts)).toHaveLength(1);
  });

  it("keeps posts without URLs", () => {
    const posts = [
      makePost({ url: "" }),
      makePost({ url: "" }),
    ];
    expect(deduplicatePosts(posts)).toHaveLength(2);
  });
});
