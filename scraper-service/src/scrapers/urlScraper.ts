import { chromium } from "playwright";
import type { Page, Response as PlaywrightResponse } from "playwright";
import { config } from "../config";
import { hasSavedCookies, getProfileDir, getStorageState, shouldUseStorageState } from "../crawler/browserAuth";
import { isCurrentWeek, isOlderThanCurrentWeek, resolveTimestamp } from "../utils/dateHelpers";
import type { Platform, ScrapedPost, ScrapeResult } from "../types";

// ---------------------------------------------------------------------------
// Detect platform from a URL
// ---------------------------------------------------------------------------

function detectPlatform(url: string): Platform | null {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/x\.com|twitter\.com/i.test(url)) return "X";
  return null;
}

// ---------------------------------------------------------------------------
// Facebook: detect if URL is a search URL
// ---------------------------------------------------------------------------

export function isFacebookSearchUrl(url: string): boolean {
  return /facebook\.com\/search\/(posts|top|groups)/i.test(url);
}

export function buildFacebookSearchUrl(keyword: string): string {
  return `https://www.facebook.com/search/posts/?q=${encodeURIComponent(keyword)}`;
}

// ---------------------------------------------------------------------------
// Facebook: GraphQL response parser
// ---------------------------------------------------------------------------

interface GraphQLPost {
  postId: string;
  author: string;
  text: string;
  timestamp: string;
  permalink: string;
  groupId: string;
  groupName: string;
}

/**
 * Recursively walk a parsed JSON object looking for Facebook post data.
 * Facebook GraphQL responses nest posts in various structures — we search
 * for any object that has recognisable post fields (message, creation_time,
 * actors, post_id / id with comet_sections, etc.).
 */
function extractPostsFromGraphQL(obj: unknown, baseUrl: string): GraphQLPost[] {
  const results: GraphQLPost[] = [];
  const seen = new Set<string>();

  function walk(node: unknown): void {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;

    const n = node as Record<string, unknown>;

    // ── Pattern 1: story node with message + actors ──
    // Common in group_feed edges: { message: { text }, actors: [{ name }], post_id, creation_time }
    if (typeof n.message === "object" && n.message !== null) {
      const msg = n.message as Record<string, unknown>;
      const text = typeof msg.text === "string" ? msg.text : "";

      if (text.length > 10) {
        const postId = String(n.post_id ?? n.id ?? n.story_id ?? "");
        if (postId && !seen.has(postId)) {
          seen.add(postId);

          // Author
          let author = "unknown";
          if (Array.isArray(n.actors) && n.actors.length > 0) {
            const actor = n.actors[0] as Record<string, unknown>;
            author = typeof actor.name === "string" ? actor.name : "unknown";
          } else if (typeof n.author === "object" && n.author !== null) {
            const a = n.author as Record<string, unknown>;
            author = typeof a.name === "string" ? a.name : "unknown";
          }

          // Timestamp
          let timestamp = "";
          if (typeof n.creation_time === "number") {
            timestamp = new Date(n.creation_time * 1000).toISOString();
          } else if (typeof n.created_time === "number") {
            timestamp = new Date(n.created_time * 1000).toISOString();
          } else if (typeof n.publish_time === "number") {
            timestamp = new Date(n.publish_time * 1000).toISOString();
          }

          // Group context
          let groupId = "";
          let groupName = "";
          if (typeof n.to === "object" && n.to !== null) {
            const to = n.to as Record<string, unknown>;
            if (typeof to.id === "string") groupId = to.id;
            if (typeof to.name === "string") groupName = to.name;
          }

          // Permalink
          let permalink = "";
          if (typeof n.url === "string" && n.url.includes("facebook.com")) {
            permalink = n.url;
          } else if (typeof n.permalink_url === "string") {
            permalink = n.permalink_url;
          } else if (groupId && postId) {
            permalink = `${baseUrl}/groups/${groupId}/posts/${postId}`;
          } else if (postId) {
            permalink = `${baseUrl}/${postId}`;
          }

          results.push({ postId, author, text, timestamp, permalink, groupId, groupName });
        }
      }
    }

    // ── Pattern 2: comet_sections pattern (CometFeedStory) ──
    if (typeof n.comet_sections === "object" && n.comet_sections !== null) {
      const sections = n.comet_sections as Record<string, unknown>;
      // Walk into content.story, context_layout.story, etc.
      walk(sections);
    }

    // ── Pattern 3: creation_story wrapper ──
    if (typeof n.creation_story === "object" && n.creation_story !== null) {
      walk(n.creation_story);
    }

    // ── Pattern 4: node.story or node.attached_story ──
    if (typeof n.story === "object" && n.story !== null) {
      walk(n.story);
    }
    if (typeof n.attached_story === "object" && n.attached_story !== null) {
      walk(n.attached_story);
    }

    // ── Pattern 5: edges array (relay-style pagination) ──
    if (Array.isArray(n.edges)) {
      for (const edge of n.edges) {
        if (typeof edge === "object" && edge !== null) {
          walk((edge as Record<string, unknown>).node ?? edge);
        }
      }
    }

    // ── Pattern 6: feed_units, group_feed, search_results ──
    for (const key of ["feed_units", "group_feed", "search_results", "results", "nodes", "items"]) {
      if (n[key] !== undefined) walk(n[key]);
    }

    // Recurse into all object values to catch deeply nested posts
    for (const key of Object.keys(n)) {
      if (["message", "actors", "edges", "comet_sections", "creation_story", "story", "attached_story"].includes(key)) continue; // already handled
      const val = n[key];
      if (typeof val === "object" && val !== null) {
        walk(val);
      }
    }
  }

  walk(obj);
  return results;
}

/**
 * Parse a GraphQL response body. Facebook often sends multiple JSON objects
 * concatenated (one per line) or wrapped in `for (;;);` prefix.
 */
function parseGraphQLResponseBody(body: string, baseUrl: string): GraphQLPost[] {
  const results: GraphQLPost[] = [];

  // Strip Facebook's anti-XSSI prefix
  let cleaned = body.replace(/^for\s*\(;;\);?\s*/, "");

  // Try parsing as single JSON first
  try {
    const json = JSON.parse(cleaned);
    results.push(...extractPostsFromGraphQL(json, baseUrl));
    return results;
  } catch {
    // Not a single JSON object — try line-by-line
  }

  // Facebook often sends newline-delimited JSON
  for (const line of cleaned.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const json = JSON.parse(trimmed);
      results.push(...extractPostsFromGraphQL(json, baseUrl));
    } catch {
      // skip unparseable lines
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Facebook: keyword / NLP matching
// ---------------------------------------------------------------------------

const DEFAULT_KEYWORDS = config.targets.facebookSearchQueries;

/**
 * Check if a post's text matches any of the given keywords.
 * Uses case-insensitive substring + word-boundary matching for accuracy.
 * Returns the list of matched keywords (empty = no match).
 */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase().trim();
    if (!kwLower) continue;
    // Check both simple substring and word-boundary match
    if (lower.includes(kwLower)) {
      matched.push(kw.trim());
    } else {
      // Try individual significant words (2+ word keywords)
      const words = kwLower.split(/\s+/).filter((w) => w.length > 2);
      if (words.length >= 2) {
        const wordMatches = words.filter((w) => lower.includes(w));
        if (wordMatches.length >= Math.ceil(words.length * 0.7)) {
          matched.push(kw.trim());
        }
      }
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Facebook extractor — GraphQL interception + DOM fallback
// ---------------------------------------------------------------------------

async function extractFacebook(page: Page, groupUrl: string): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting Facebook posts via GraphQL interception + DOM fallback...`);

  const baseUrl = new URL(groupUrl).origin; // https://www.facebook.com
  const graphqlPosts: GraphQLPost[] = [];
  let graphqlResponseCount = 0;

  // ── Step 1: Set up GraphQL response interception ──
  const responseHandler = async (response: PlaywrightResponse) => {
    const url = response.url();
    if (!url.includes("/api/graphql") && !url.includes("graphql")) return;

    try {
      const body = await response.text();
      graphqlResponseCount++;
      const posts = parseGraphQLResponseBody(body, baseUrl);
      if (posts.length > 0) {
        graphqlPosts.push(...posts);
        console.log(`[url-scraper]   GraphQL response #${graphqlResponseCount}: extracted ${posts.length} posts (total: ${graphqlPosts.length})`);
      }
    } catch {
      // Response may not be readable (e.g. binary, streaming)
    }
  };

  page.on("response", responseHandler);

  // ── Step 2: Scroll to trigger dynamic content & GraphQL requests ──
  let hitOldPost = false;

  for (let i = 0; i < 10; i++) {
    if (hitOldPost) {
      console.log(`[url-scraper]   Stopping scroll — detected posts older than current week`);
      break;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(2000); // slightly longer wait to let GraphQL responses arrive
    console.log(`[url-scraper]   Scroll ${i + 1}/10 (GraphQL posts so far: ${graphqlPosts.length})`);

    // Quick check: do we have timestamps indicating old posts?
    const oldPostDetected = await page.evaluate(() => {
      const timeEls = document.querySelectorAll('abbr[data-utime], time[datetime]');
      for (const el of timeEls) {
        const utime = (el as HTMLElement).dataset?.utime;
        if (utime) {
          const postDate = new Date(parseInt(utime) * 1000);
          const now = new Date();
          const dayOfWeek = now.getUTCDay();
          const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const monday = new Date(now);
          monday.setUTCDate(monday.getUTCDate() - diffToMonday);
          monday.setUTCHours(0, 0, 0, 0);
          if (postDate < monday) return true;
        }
      }
      return false;
    });
    if (oldPostDetected) hitOldPost = true;
  }

  // Remove listener after scrolling is done
  page.off("response", responseHandler);

  console.log(`[url-scraper] GraphQL interception complete: ${graphqlResponseCount} responses, ${graphqlPosts.length} posts extracted`);

  // ── Step 3: Process GraphQL posts ──
  if (graphqlPosts.length > 0) {
    const seen = new Set<string>();
    const deduped = graphqlPosts.filter((p) => {
      if (seen.has(p.postId)) return false;
      seen.add(p.postId);
      return true;
    });

    // Resolve timestamps and filter to current week
    const withTs = deduped.map((p) => ({
      ...p,
      resolvedTs: resolveTimestamp(p.timestamp),
    }));

    const currentWeek = withTs.filter((p) => isCurrentWeek(p.resolvedTs));
    const oldCount = withTs.filter((p) => isOlderThanCurrentWeek(p.resolvedTs)).length;

    console.log(`[url-scraper] Facebook GraphQL: ${deduped.length} unique posts, ${currentWeek.length} current week, ${oldCount} older (skipped)`);

    // ── Step 4: Keyword/NLP filtering ──
    const keywords = DEFAULT_KEYWORDS;
    const keywordFiltered = currentWeek.map((p) => ({
      ...p,
      matchedKeywords: matchKeywords(p.text, keywords),
    }));

    // Log keyword matches
    const withMatches = keywordFiltered.filter((p) => p.matchedKeywords.length > 0);
    const noMatches = keywordFiltered.filter((p) => p.matchedKeywords.length === 0);

    console.log(`[url-scraper] Keyword filtering: ${withMatches.length} matched, ${noMatches.length} unmatched`);
    keywordFiltered.forEach((p, i) => {
      const kwTag = p.matchedKeywords.length > 0 ? ` [KW: ${p.matchedKeywords.join(", ")}]` : " [no keyword match]";
      console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."${kwTag} -> ${p.permalink.slice(0, 100)}`);
    });

    // Return ALL current-week posts (keyword info is logged; backend AI scoring handles prioritisation)
    return keywordFiltered.map((p) => ({
      author: p.author,
      text: p.text,
      url: p.permalink,
      timestamp: p.resolvedTs || new Date().toISOString(),
      engagement: 0,
    }));
  }

  // ── Step 5: DOM fallback — if GraphQL yielded nothing ──
  console.log(`[url-scraper] GraphQL yielded 0 posts — falling back to DOM extraction...`);
  return extractFacebookDOM(page, groupUrl);
}

// ---------------------------------------------------------------------------
// Facebook DOM extractor (original approach, used as fallback)
// ---------------------------------------------------------------------------

async function extractFacebookDOM(page: Page, groupUrl: string): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] DOM fallback: extracting Facebook posts from div[role="article"]...`);

  // Click "See more" buttons to expand truncated post text
  try {
    const seeMoreButtons = await page.$$('div[role="button"]');
    let expanded = 0;
    for (const btn of seeMoreButtons) {
      const text = await btn.textContent().catch(() => "");
      if (text && /^see more$/i.test(text.trim())) {
        await btn.click().catch(() => {});
        expanded++;
        await page.waitForTimeout(300);
      }
    }
    if (expanded > 0) {
      console.log(`[url-scraper] Expanded ${expanded} "See more" buttons`);
      await page.waitForTimeout(1000);
    }
  } catch {
    console.log(`[url-scraper] "See more" expansion skipped (non-critical)`);
  }

  // Extract the base URL for building full permalinks
  const baseUrl = new URL(groupUrl).origin; // https://www.facebook.com

  const posts = await page.evaluate((baseUrlArg: string) => {
    const results: { author: string; text: string; url: string; rawTs: string }[] = [];

    // Helper: check if an element is inside the comments section
    function isInsideCommentSection(el: Element, postArticle: Element): boolean {
      const closestArticle = el.closest('div[role="article"]');
      if (closestArticle && closestArticle !== postArticle) return true;
      if (el.closest("form")) return true;
      const parentList = el.closest('ul[role="list"], ul');
      if (parentList && postArticle.contains(parentList)) {
        if (parentList.querySelector('div[role="article"]')) return true;
      }
      const commentContainer = el.closest(
        '[aria-label*="comment" i], [aria-label*="Comment" i], [aria-label*="reply" i], [aria-label*="Reply" i]'
      );
      if (commentContainer && postArticle.contains(commentContainer)) return true;
      return false;
    }

    /**
     * Extract permalink from a post article element.
     */
    function extractPermalink(article: Element): string {
      function toFullUrl(href: string): string {
        try { return new URL(href, baseUrlArg).href; }
        catch { return href.startsWith("http") ? href : `${baseUrlArg}${href}`; }
      }

      const permalinkSelectors = [
        'a[href*="/posts/"]',
        'a[href*="/permalink/"]',
        'a[href*="story_fbid"]',
        'a[href*="/p/"]',
        'a[href*="/groups/"][href*="/posts/"]',
      ];

      for (const selector of permalinkSelectors) {
        const link = article.querySelector(selector) as HTMLAnchorElement | null;
        if (link?.href) return toFullUrl(link.href);
      }

      const allAnchors = article.querySelectorAll('a[href]');
      for (const link of allAnchors) {
        const href = (link as HTMLAnchorElement).href || "";
        const hasTime = link.querySelector('abbr, time, [data-utime]');
        const linkText = link.textContent?.trim() || "";
        const isTimestampLink = hasTime ||
          /^\d+[hmdw]$/.test(linkText) ||
          /ago|hr|min|just now|yesterday/i.test(linkText) ||
          /^\d{1,2}\/\d{1,2}/.test(linkText);

        if (isTimestampLink && href.includes("facebook.com")) {
          const patterns = ["/posts/", "/permalink/", "story_fbid", "/p/", "/groups/"];
          if (patterns.some((p) => href.includes(p))) {
            return href;
          }
        }
      }

      for (const link of article.querySelectorAll('a[href*="facebook.com"]')) {
        const href = (link as HTMLAnchorElement).href;
        if (/\/(?:posts|permalink|p)\/\d+/.test(href) || /story_fbid=\d+/.test(href)) {
          return href;
        }
      }

      for (const link of allAnchors) {
        const href = (link as HTMLAnchorElement).href || "";
        const ariaLabel = link.getAttribute("aria-label") || "";
        if (ariaLabel && href.includes("facebook.com") && /\d/.test(ariaLabel)) {
          if (href.includes("/groups/") || href.includes("/posts/") || href.includes("/permalink/") || href.includes("story_fbid")) {
            return href;
          }
        }
      }

      const headerArea = article.querySelector('h2, h3, h4, [data-ad-preview="message"]')?.parentElement?.parentElement;
      if (headerArea) {
        for (const link of headerArea.querySelectorAll('a[href*="facebook.com"]')) {
          const href = (link as HTMLAnchorElement).href;
          if (/\/(?:posts|permalink|p)\/\d+/.test(href) || /story_fbid/.test(href) || /\/groups\/[^/]+\/posts\//.test(href)) {
            return href;
          }
        }
      }

      const dataFt = article.getAttribute("data-ft");
      if (dataFt) {
        try {
          const ft = JSON.parse(dataFt);
          const topLevelPostId = ft.top_level_post_id || ft.tl_objid;
          if (topLevelPostId) {
            return `${baseUrlArg}/permalink.php?story_fbid=${topLevelPostId}&id=${ft.page_id || ft.content_owner_id_new || ""}`;
          }
        } catch { /* ignore parse errors */ }
      }

      for (const link of allAnchors) {
        const href = (link as HTMLAnchorElement).href || "";
        if (href.includes("facebook.com") && /\/\d{10,}/.test(href)) {
          return href;
        }
      }

      return "";
    }

    const allArticles = Array.from(document.querySelectorAll('div[role="article"]'));
    const articles = allArticles.filter(
      (a) => !a.parentElement?.closest('div[role="article"]')
    );

    articles.forEach((article) => {
      const textEls = article.querySelectorAll('div[dir="auto"]');
      let text = "";
      textEls.forEach((el) => {
        if (isInsideCommentSection(el, article)) return;
        const t = el.textContent?.trim() || "";
        if (t.length > 15 && !text.includes(t)) {
          text += (text ? "\n" : "") + t;
        }
      });

      if (text.length < 20) return;

      const authorEl = article.querySelector(
        'h2 a, h3 a, h4 a, strong a, a[role="link"] > strong, a[role="link"] span[dir="auto"]'
      );
      const author = authorEl?.textContent?.trim() || "unknown";
      const url = extractPermalink(article);

      const abbrEl = article.querySelector('abbr[data-utime]') as HTMLElement | null;
      const timeEl = article.querySelector('time[datetime]') as HTMLElement | null;
      let rawTs = "";
      if (abbrEl?.dataset?.utime) {
        rawTs = new Date(parseInt(abbrEl.dataset.utime) * 1000).toISOString();
      } else if (timeEl?.getAttribute("datetime")) {
        rawTs = timeEl.getAttribute("datetime") || "";
      } else {
        const relEl = article.querySelector('abbr, time, [aria-label*="ago"], [title*="ago"]') as HTMLElement | null;
        rawTs = relEl?.getAttribute("aria-label") || relEl?.getAttribute("title") || relEl?.textContent?.trim() || "";
      }

      results.push({ author, text, url, rawTs });
    });

    if (results.length === 0) {
      const blocks = document.querySelectorAll('div[data-ad-comet-preview="message"], div[data-ad-preview="message"]');
      blocks.forEach((block) => {
        const text = block.textContent?.trim() || "";
        if (text.length >= 30) {
          results.push({ author: "unknown", text, url: "", rawTs: "" });
        }
      });
    }

    return results;
  }, baseUrl);

  const resolved = posts.map((p) => ({
    ...p,
    resolvedTs: resolveTimestamp(p.rawTs),
  }));

  const filtered = resolved.filter((p) => isCurrentWeek(p.resolvedTs));

  const oldCount = resolved.filter((p) => isOlderThanCurrentWeek(p.resolvedTs)).length;
  console.log(`[url-scraper] Facebook DOM: found ${posts.length} articles, ${filtered.length} from current week, ${oldCount} older (skipped)`);
  filtered.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..." url=${p.url.slice(0, 100)}`);
  });

  return filtered.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: p.resolvedTs || new Date().toISOString(),
    engagement: 0,
  }));
}

// ---------------------------------------------------------------------------
// Facebook search extractor — searches Facebook for keywords via search URL
// ---------------------------------------------------------------------------

async function extractFacebookSearch(page: Page, searchUrl: string): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting Facebook search results via GraphQL interception...`);

  const baseUrl = "https://www.facebook.com";
  const graphqlPosts: GraphQLPost[] = [];
  let graphqlResponseCount = 0;

  // Set up GraphQL response interception
  const responseHandler = async (response: PlaywrightResponse) => {
    const url = response.url();
    if (!url.includes("/api/graphql") && !url.includes("graphql")) return;

    try {
      const body = await response.text();
      graphqlResponseCount++;
      const posts = parseGraphQLResponseBody(body, baseUrl);
      if (posts.length > 0) {
        graphqlPosts.push(...posts);
        console.log(`[url-scraper]   Search GraphQL #${graphqlResponseCount}: ${posts.length} posts (total: ${graphqlPosts.length})`);
      }
    } catch {
      // skip unreadable responses
    }
  };

  page.on("response", responseHandler);

  // Scroll search results to load more
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(2000);
    console.log(`[url-scraper]   Search scroll ${i + 1}/8 (posts: ${graphqlPosts.length})`);
  }

  page.off("response", responseHandler);

  console.log(`[url-scraper] Facebook search: ${graphqlResponseCount} GraphQL responses, ${graphqlPosts.length} posts`);

  // If GraphQL interception worked, use those results
  if (graphqlPosts.length > 0) {
    const seen = new Set<string>();
    const deduped = graphqlPosts.filter((p) => {
      if (seen.has(p.postId)) return false;
      seen.add(p.postId);
      return true;
    });

    const withTs = deduped.map((p) => ({
      ...p,
      resolvedTs: resolveTimestamp(p.timestamp),
    }));

    const currentWeek = withTs.filter((p) => isCurrentWeek(p.resolvedTs));
    console.log(`[url-scraper] Facebook search: ${deduped.length} unique, ${currentWeek.length} current week`);

    currentWeek.forEach((p, i) => {
      console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..." -> ${p.permalink.slice(0, 100)}`);
    });

    return currentWeek.map((p) => ({
      author: p.author,
      text: p.text,
      url: p.permalink,
      timestamp: p.resolvedTs || new Date().toISOString(),
      engagement: 0,
    }));
  }

  // Fallback: DOM-based extraction of search results
  console.log(`[url-scraper] Search GraphQL yielded 0 — falling back to DOM...`);
  return extractFacebookDOM(page, searchUrl);
}

// ---------------------------------------------------------------------------
// Reddit extractor — uses NEW reddit interface (www.reddit.com)
// ---------------------------------------------------------------------------

async function extractReddit(page: import("playwright").Page, targetUrl: string): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting Reddit posts (new interface)...`);

  // Check for Reddit block / interstitial pages
  const pageContent = await page.content();
  const isBlocked =
    pageContent.includes("whoa there, pardner") ||
    pageContent.includes("you've been blocked") ||
    pageContent.includes("cdn-cgi/challenge") ||
    pageContent.includes("Request blocked");
  if (isBlocked) {
    console.warn(`[url-scraper] Reddit appears to be blocking the request (anti-bot page detected)`);
  }

  let hitOldPost = false;

  // Scroll to load posts, stop early on old posts
  for (let i = 0; i < 6; i++) {
    if (hitOldPost) {
      console.log(`[url-scraper]   Stopping scroll — detected posts older than current week`);
      break;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1200);
    console.log(`[url-scraper]   Scroll ${i + 1}/6`);

    // Check for old posts via shreddit-post timestamps
    const oldDetected = await page.evaluate(() => {
      const posts = document.querySelectorAll("shreddit-post");
      for (const post of posts) {
        const ts = post.getAttribute("created-timestamp");
        if (ts) {
          const postDate = new Date(ts);
          const now = new Date();
          const dayOfWeek = now.getUTCDay();
          const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const monday = new Date(now);
          monday.setUTCDate(monday.getUTCDate() - diffToMonday);
          monday.setUTCHours(0, 0, 0, 0);
          if (postDate < monday) return true;
        }
      }
      return false;
    });
    if (oldDetected) hitOldPost = true;
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string; engagement: number; rawTs: string }[] = [];

    // NEW reddit: shreddit-post custom elements expose data via attributes
    document.querySelectorAll("shreddit-post").forEach((post) => {
      const text = post.getAttribute("post-title") || "";
      const author = post.getAttribute("author") || "unknown";
      const permalink = post.getAttribute("permalink") || post.getAttribute("content-href") || "";
      const score = parseInt(post.getAttribute("score") || "0", 10) || 0;
      const createdTs = post.getAttribute("created-timestamp") || "";
      const url = permalink
        ? (permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`)
        : "";
      if (text.length > 5) results.push({ author, text, url, engagement: score, rawTs: createdTs });
    });

    // Fallback: article / data-testid containers (new reddit alternative layout)
    if (results.length === 0) {
      document.querySelectorAll('article, [data-testid="post-container"]').forEach((card) => {
        const titleEl = card.querySelector('h3, a[slot="title"], [data-testid="post-title"]');
        const authorEl = card.querySelector('a[href*="/user/"]');
        const timeEl = card.querySelector("faceplate-timeago, time[datetime]") as HTMLElement | null;
        const linkEl = card.querySelector('a[href*="/comments/"]') as HTMLAnchorElement | null;
        const text = titleEl?.textContent?.trim() || "";
        const author = authorEl?.textContent?.trim() || "unknown";
        const tsAttr = timeEl?.getAttribute("ts");
        const rawTs = tsAttr
          ? new Date(parseInt(tsAttr)).toISOString()
          : (timeEl?.getAttribute("datetime") || "");
        const url = linkEl?.href || "";
        if (text.length > 10) results.push({ author, text, url, engagement: 0, rawTs });
      });
    }

    return results;
  });

  // Resolve timestamps and filter to current week
  const resolved = posts.map((p) => ({
    ...p,
    resolvedTs: resolveTimestamp(p.rawTs),
  }));
  const filtered = resolved.filter((p) => isCurrentWeek(p.resolvedTs));

  const oldCount = resolved.filter((p) => isOlderThanCurrentWeek(p.resolvedTs)).length;
  console.log(`[url-scraper] Reddit: found ${resolved.length} posts, ${filtered.length} from current week, ${oldCount} older (skipped)`);
  filtered.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  // If browser extraction found 0 current-week posts, try JSON API fallback
  if (filtered.length === 0) {
    console.log(`[url-scraper] New Reddit returned 0 current-week posts, trying JSON API fallback...`);
    return extractRedditViaJson(targetUrl);
  }

  return filtered.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: p.resolvedTs || new Date().toISOString(),
    engagement: p.engagement,
  }));
}

// ---------------------------------------------------------------------------
// Reddit JSON API fallback
// ---------------------------------------------------------------------------

async function extractRedditViaJson(originalUrl: string): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  // Ensure we use www.reddit.com (not old.reddit.com)
  let jsonUrl = originalUrl.replace(/old\.reddit\.com/i, "www.reddit.com");
  // Append /new.json if this is a subreddit URL (to get new posts only)
  if (/\/r\/[^/]+\/?$/.test(jsonUrl)) {
    jsonUrl = jsonUrl.replace(/\/+$/, "") + "/new.json";
  } else {
    jsonUrl = jsonUrl.replace(/\/+$/, "") + ".json";
  }

  console.log(`[url-scraper] Reddit JSON fallback: ${jsonUrl}`);

  try {
    const resp = await fetch(jsonUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      console.warn(`[url-scraper] Reddit JSON API returned ${resp.status}`);
      return [];
    }

    const json = await resp.json();
    const listing = json?.data?.children ?? (Array.isArray(json) ? json[0]?.data?.children : null) ?? [];

    const results: Omit<ScrapedPost, "platform" | "source">[] = [];
    for (const child of listing) {
      const d = child?.data;
      if (!d || child.kind !== "t3") continue; // t3 = link/post

      const title = d.title || "";
      const selftext = d.selftext || "";
      const text = selftext ? `${title}\n\n${selftext}` : title;
      if (text.length < 5) continue;

      const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : "";
      const createdUtc = d.created_utc ? new Date(d.created_utc * 1000).toISOString() : "";

      // Filter to current week
      if (isOlderThanCurrentWeek(createdUtc)) {
        console.log(`[url-scraper]   Skipping old Reddit post: "${title.slice(0, 60)}..." (${createdUtc})`);
        continue;
      }

      results.push({
        author: d.author || "unknown",
        text,
        url: permalink,
        timestamp: createdUtc || new Date().toISOString(),
        engagement: d.score ?? 0,
      });
    }

    console.log(`[url-scraper] Reddit JSON fallback: found ${results.length} current-week posts`);
    return results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[url-scraper] Reddit JSON fallback failed: ${msg}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// LinkedIn extractor
// ---------------------------------------------------------------------------

async function extractLinkedin(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting LinkedIn posts...`);
  await page.waitForTimeout(3000);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string; rawTs: string }[] = [];

    document.querySelectorAll('.feed-shared-update-v2, .occludable-update, div[data-urn]').forEach((container) => {
      const textEl = container.querySelector('.feed-shared-text, .break-words, .update-components-text');
      const authorEl = container.querySelector('.feed-shared-actor__name, .update-components-actor__name');
      const linkEl = container.querySelector('a[href*="/feed/update/"]');
      const timeEl = container.querySelector('time[datetime]') as HTMLElement | null;
      const relEl = container.querySelector('.feed-shared-actor__sub-description, .update-components-actor__meta') as HTMLElement | null;
      const text = textEl?.textContent?.trim() || "";
      const author = authorEl?.textContent?.trim() || "unknown";
      const url = (linkEl as HTMLAnchorElement)?.href || "";
      const rawTs = timeEl?.getAttribute("datetime") || relEl?.textContent?.trim() || "";
      if (text.length > 20) results.push({ author, text, url, rawTs });
    });

    return results;
  });

  // Filter to current week
  const resolved = posts.map((p) => ({
    ...p,
    resolvedTs: resolveTimestamp(p.rawTs),
  }));
  const filtered = resolved.filter((p) => isCurrentWeek(p.resolvedTs));

  console.log(`[url-scraper] LinkedIn: found ${posts.length} posts, ${filtered.length} from current week`);
  filtered.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  return filtered.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: p.resolvedTs || new Date().toISOString(),
    engagement: 0,
  }));
}

// ---------------------------------------------------------------------------
// X/Twitter extractor
// ---------------------------------------------------------------------------

async function extractX(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting X/Twitter posts...`);
  await page.waitForTimeout(3000);

  let hitOldPost = false;

  for (let i = 0; i < 5; i++) {
    if (hitOldPost) {
      console.log(`[url-scraper]   Stopping scroll — detected posts older than current week`);
      break;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);

    // Check for old tweets via time[datetime]
    const oldDetected = await page.evaluate(() => {
      const times = document.querySelectorAll('article[data-testid="tweet"] time[datetime]');
      for (const t of times) {
        const dt = t.getAttribute("datetime");
        if (dt) {
          const postDate = new Date(dt);
          const now = new Date();
          const dayOfWeek = now.getUTCDay();
          const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const monday = new Date(now);
          monday.setUTCDate(monday.getUTCDate() - diffToMonday);
          monday.setUTCHours(0, 0, 0, 0);
          if (postDate < monday) return true;
        }
      }
      return false;
    });
    if (oldDetected) hitOldPost = true;
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string; rawTs: string }[] = [];

    document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
      const textEl = tweet.querySelector('[data-testid="tweetText"]');
      const authorEl = tweet.querySelector('a[href*="/"] div[dir="ltr"] > span');
      const linkEl = tweet.querySelector('a[href*="/status/"]');
      const timeEl = tweet.querySelector('time[datetime]') as HTMLElement | null;
      const text = textEl?.textContent?.trim() || "";
      const author = authorEl?.textContent?.trim() || "unknown";
      const url = (linkEl as HTMLAnchorElement)?.href || "";
      const rawTs = timeEl?.getAttribute("datetime") || "";
      if (text.length > 10) results.push({ author, text, url, rawTs });
    });

    return results;
  });

  // Filter to current week
  const resolved = posts.map((p) => ({
    ...p,
    resolvedTs: resolveTimestamp(p.rawTs),
  }));
  const filtered = resolved.filter((p) => isCurrentWeek(p.resolvedTs));

  console.log(`[url-scraper] X: found ${posts.length} tweets, ${filtered.length} from current week`);
  filtered.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  return filtered.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: p.resolvedTs || new Date().toISOString(),
    engagement: 0,
  }));
}

// ---------------------------------------------------------------------------
// Generic extractor (non-platform URLs)
// ---------------------------------------------------------------------------

async function extractGeneric(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting posts from generic page...`);

  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string; rawTs: string }[] = [];
    const seen = new Set<string>();

    // Strategy 1: article elements
    document.querySelectorAll('article, [role="article"]').forEach((article) => {
      const headingEl = article.querySelector('h1, h2, h3, h4, a');
      const textEls = article.querySelectorAll('p, div[dir="auto"], .post-content, .entry-content');
      let text = "";
      textEls.forEach((el) => {
        const t = el.textContent?.trim() || "";
        if (t.length > 20 && !text.includes(t)) {
          text += (text ? "\n" : "") + t;
        }
      });
      if (!text && headingEl) text = headingEl.textContent?.trim() || "";
      if (text.length < 20) return;
      const textKey = text.slice(0, 200);
      if (seen.has(textKey)) return;
      seen.add(textKey);

      const linkEl = article.querySelector('a[href]') as HTMLAnchorElement | null;
      const url = linkEl?.href || "";
      const authorEl = article.querySelector('[rel="author"], .author, .byline, .username, a[href*="/user/"], a[href*="/profile/"]');
      const author = authorEl?.textContent?.trim() || "unknown";
      const timeEl = article.querySelector('time[datetime]') as HTMLElement | null;
      const rawTs = timeEl?.getAttribute("datetime") || "";

      results.push({ author, text, url, rawTs });
    });

    // Strategy 2: post-like containers
    if (results.length === 0) {
      document.querySelectorAll('.post, .comment, .entry, .thread, .message, [class*="post-"], [class*="Post"]').forEach((container) => {
        const text = container.textContent?.trim() || "";
        if (text.length < 30 || text.length > 10000) return;
        const textKey = text.slice(0, 200);
        if (seen.has(textKey)) return;
        seen.add(textKey);

        const linkEl = container.querySelector('a[href]') as HTMLAnchorElement | null;
        const authorEl = container.querySelector('.author, .username, .user, [class*="author"], [class*="user"]');
        const timeEl = container.querySelector('time[datetime]') as HTMLElement | null;

        results.push({
          author: authorEl?.textContent?.trim() || "unknown",
          text: text.slice(0, 2000),
          url: linkEl?.href || "",
          rawTs: timeEl?.getAttribute("datetime") || "",
        });
      });
    }

    // Strategy 3: heading + paragraph blocks
    if (results.length === 0) {
      document.querySelectorAll('h1, h2, h3').forEach((heading) => {
        const title = heading.textContent?.trim() || "";
        if (title.length < 10) return;

        let body = "";
        let sibling = heading.nextElementSibling;
        while (sibling && !['H1', 'H2', 'H3'].includes(sibling.tagName)) {
          if (sibling.tagName === 'P' || sibling.tagName === 'DIV') {
            const t = sibling.textContent?.trim() || "";
            if (t.length > 15) body += (body ? "\n" : "") + t;
          }
          sibling = sibling.nextElementSibling;
        }

        const text = body ? `${title}\n\n${body}` : title;
        if (text.length < 30) return;
        const textKey = text.slice(0, 200);
        if (seen.has(textKey)) return;
        seen.add(textKey);

        const linkEl = heading.querySelector('a[href]') as HTMLAnchorElement | null;
        results.push({
          author: "unknown",
          text: text.slice(0, 2000),
          url: linkEl?.href || "",
          rawTs: "",
        });
      });
    }

    return results;
  });

  console.log(`[url-scraper] Generic: found ${posts.length} content blocks`);
  posts.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  return posts.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: p.rawTs || new Date().toISOString(),
    engagement: 0,
  }));
}

// ---------------------------------------------------------------------------
// Main: scrape a specific URL using Playwright with saved cookies
// ---------------------------------------------------------------------------

export async function scrapeUrl(targetUrl: string): Promise<ScrapeResult> {
  const start = Date.now();
  const posts: ScrapedPost[] = [];
  const errors: string[] = [];

  const platform = detectPlatform(targetUrl) ?? "Other";

  const cookiesExist = hasSavedCookies();

  console.log(`\n[url-scraper] ========================================`);
  console.log(`[url-scraper] Target URL: ${targetUrl}`);
  console.log(`[url-scraper] Platform:   ${platform}`);
  console.log(`[url-scraper] Cookies:    ${cookiesExist ? "YES — using saved login session" : "NO — scraping without login (limited)"}`);
  console.log(`[url-scraper] Headless:   ${config.headless}`);
  console.log(`[url-scraper] ========================================\n`);

  if (!cookiesExist && platform !== "Reddit" && platform !== "Other") {
    console.warn(`[url-scraper] WARNING: No saved cookies. ${platform} requires login to see posts.`);
    console.warn(`[url-scraper] Run: cd scraper-service && npx ts-node src/crawler/browserAuth.ts`);
    console.warn(`[url-scraper] to open a browser, log in, and save cookies.\n`);
  }

  let context: import("playwright").BrowserContext | null = null;
  let browser: import("playwright").Browser | null = null;
  try {
    let page: import("playwright").Page;

    if (cookiesExist && shouldUseStorageState()) {
      const statePath = getStorageState();
      console.log(`[url-scraper] Using storageState: ${statePath ? "yes" : "none"}`);
      browser = await chromium.launch({
        headless: config.headless,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      context = await browser.newContext({
        storageState: statePath,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      page = await context.newPage();
    } else if (cookiesExist) {
      console.log(`[url-scraper] Using persistent profile: ${getProfileDir()}`);
      context = await chromium.launchPersistentContext(getProfileDir(), {
        headless: config.headless,
        args: ["--disable-blink-features=AutomationControlled"],
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      page = context.pages()[0] || (await context.newPage());
    } else {
      browser = await chromium.launch({
        headless: config.headless,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      page = await context.newPage();
    }

    // Reddit: use www.reddit.com (new interface), append /new/ for subreddit feeds
    let navigateUrl = targetUrl;
    if (platform === "Reddit") {
      // Normalize to www.reddit.com
      navigateUrl = navigateUrl.replace(/old\.reddit\.com/i, "www.reddit.com");
      // Append /new/ for subreddit URLs to get newest posts first
      if (/\/r\/[^/]+\/?$/.test(navigateUrl)) {
        navigateUrl = navigateUrl.replace(/\/+$/, "") + "/new/";
        console.log(`[url-scraper] Reddit: using /new/ feed for newest posts first`);
      }
    }

    // Navigate
    console.log(`[url-scraper] Navigating to: ${navigateUrl}`);
    await page.goto(navigateUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Log page state
    const pageTitle = await page.title();
    const finalUrl = page.url();
    console.log(`[url-scraper] Page title: "${pageTitle}"`);
    console.log(`[url-scraper] Final URL:  ${finalUrl}`);

    // Check for login redirect
    const isLoginPage =
      finalUrl.includes("/login") ||
      finalUrl.includes("/checkpoint") ||
      finalUrl.includes("/signin") ||
      pageTitle.toLowerCase().includes("log in");

    if (isLoginPage) {
      console.warn(`[url-scraper] REDIRECTED TO LOGIN — cannot scrape without cookies`);
      errors.push(
        `${platform} requires login. Run: cd scraper-service && npx ts-node src/crawler/browserAuth.ts`
      );
    } else {
      // Platform-specific login verification
      if (platform === "Facebook") {
        const fbLoginCheck = await page.evaluate(() => {
          const profileLink = document.querySelector('a[href*="/me"], a[aria-label="Profile"], div[role="navigation"] a[href*="/profile"]');
          const logoutLink = document.querySelector('a[href*="logout"], [data-testid="royal_logout"]');
          const createPostBox = document.querySelector('div[role="main"] div[role="button"][tabindex="0"]');
          const feedContent = document.querySelectorAll('div[role="article"]').length;
          return {
            hasProfileLink: !!profileLink,
            hasLogoutLink: !!logoutLink,
            hasCreatePostBox: !!createPostBox,
            articleCount: feedContent,
          };
        });
        const loggedIn = fbLoginCheck.hasProfileLink || fbLoginCheck.hasLogoutLink || fbLoginCheck.articleCount > 0;
        console.log(`[url-scraper] Facebook login check:`);
        console.log(`[url-scraper]   Logged in:       ${loggedIn ? "YES" : "NO (likely not authenticated)"}`);
        console.log(`[url-scraper]   Profile link:    ${fbLoginCheck.hasProfileLink}`);
        console.log(`[url-scraper]   Logout link:     ${fbLoginCheck.hasLogoutLink}`);
        console.log(`[url-scraper]   Create post box: ${fbLoginCheck.hasCreatePostBox}`);
        console.log(`[url-scraper]   Articles in DOM: ${fbLoginCheck.articleCount}`);
        if (!loggedIn) {
          console.warn(`[url-scraper] WARNING: Facebook session appears unauthenticated — posts may not load`);
          console.warn(`[url-scraper]   Run: cd scraper-service && npx ts-node src/crawler/browserAuth.ts`);
        }
      } else if (platform === "LinkedIn") {
        const liLoginCheck = await page.evaluate(() => {
          const feedCards = document.querySelectorAll('.feed-shared-update-v2, .occludable-update, div[data-urn]').length;
          const navProfile = document.querySelector('a[href*="/in/"], img.global-nav__me-photo, .feed-identity-module');
          return { feedCards, hasNavProfile: !!navProfile };
        });
        const loggedIn = liLoginCheck.hasNavProfile || liLoginCheck.feedCards > 0;
        console.log(`[url-scraper] LinkedIn login check:`);
        console.log(`[url-scraper]   Logged in:    ${loggedIn ? "YES" : "NO (likely not authenticated)"}`);
        console.log(`[url-scraper]   Nav profile:  ${liLoginCheck.hasNavProfile}`);
        console.log(`[url-scraper]   Feed cards:   ${liLoginCheck.feedCards}`);
        if (!loggedIn) {
          console.warn(`[url-scraper] WARNING: LinkedIn session appears unauthenticated — posts may not load`);
        }
      } else if (platform === "X") {
        const xLoginCheck = await page.evaluate(() => {
          const tweets = document.querySelectorAll('article[data-testid="tweet"]').length;
          const navProfile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"], a[href*="/compose/tweet"]');
          return { tweets, hasNavProfile: !!navProfile };
        });
        const loggedIn = xLoginCheck.hasNavProfile || xLoginCheck.tweets > 0;
        console.log(`[url-scraper] X/Twitter login check:`);
        console.log(`[url-scraper]   Logged in:    ${loggedIn ? "YES" : "NO (likely not authenticated)"}`);
        console.log(`[url-scraper]   Nav profile:  ${xLoginCheck.hasNavProfile}`);
        console.log(`[url-scraper]   Tweets in DOM: ${xLoginCheck.tweets}`);
        if (!loggedIn) {
          console.warn(`[url-scraper] WARNING: X session appears unauthenticated — posts may not load`);
        }
      }
      // Extract posts
      let extracted: Omit<ScrapedPost, "platform" | "source">[] = [];
      switch (platform) {
        case "Facebook":
          if (isFacebookSearchUrl(targetUrl)) {
            extracted = await extractFacebookSearch(page, targetUrl);
          } else {
            extracted = await extractFacebook(page, targetUrl);
          }
          break;
        case "Reddit":
          extracted = await extractReddit(page, targetUrl);
          break;
        case "LinkedIn":
          extracted = await extractLinkedin(page);
          break;
        case "X":
          extracted = await extractX(page);
          break;
        case "Other":
          extracted = await extractGeneric(page);
          break;
      }

      for (const item of extracted) {
        posts.push({
          ...item,
          platform,
          source: "manual-url",
          url: item.url || targetUrl,
        });
      }
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Scraper error: ${msg}`);
    console.error(`[url-scraper] Exception: ${msg}`);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  // Result summary
  console.log(`\n[url-scraper] ========== RESULT ==========`);
  console.log(`[url-scraper] Posts found: ${posts.length}`);
  console.log(`[url-scraper] Errors: ${errors.length}`);
  console.log(`[url-scraper] Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  if (posts.length > 0) {
    console.log(`[url-scraper] Posts:`);
    posts.forEach((p, i) =>
      console.log(`[url-scraper]   ${i + 1}. [${p.author}] ${p.text.slice(0, 120)}... -> ${p.url.slice(0, 100)}`)
    );
  }
  if (errors.length > 0) {
    console.log(`[url-scraper] Errors:`);
    errors.forEach((e) => console.log(`[url-scraper]   - ${e}`));
  }
  console.log(`[url-scraper] ===========================\n`);

  return {
    platform,
    posts: posts.slice(0, config.maxResultsPerRun),
    duration: Date.now() - start,
    errors,
  };
}
