import { chromium } from "playwright";
import { config } from "../config";
import { hasSavedCookies, getProfileDir } from "../crawler/browserAuth";
import type { Platform, ScrapedPost, ScrapeResult } from "../types";

/**
 * Detect platform from a URL.
 */
function detectPlatform(url: string): Platform | null {
  if (/facebook\.com|fb\.com/i.test(url)) return "Facebook";
  if (/linkedin\.com/i.test(url)) return "LinkedIn";
  if (/reddit\.com/i.test(url)) return "Reddit";
  if (/x\.com|twitter\.com/i.test(url)) return "X";
  return null;
}

// ---------------------------------------------------------------------------
// Platform-specific extractors
// ---------------------------------------------------------------------------

async function extractFacebook(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting Facebook posts...`);

  // Scroll to load posts
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
    console.log(`[url-scraper]   Scroll ${i + 1}/5`);
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string }[] = [];

    // Strategy 1: div[role="article"] — group/feed posts
    const articles = document.querySelectorAll('div[role="article"]');
    articles.forEach((article) => {
      // Get all text from the post — Facebook nests text in multiple div[dir="auto"]
      const textEls = article.querySelectorAll('div[dir="auto"]');
      let text = "";
      textEls.forEach((el) => {
        const t = el.textContent?.trim() || "";
        if (t.length > 15 && !text.includes(t)) {
          text += (text ? "\n" : "") + t;
        }
      });

      if (text.length < 20) return;

      // Author
      const authorEl = article.querySelector('strong a, h2 a, h3 a, h4 a, a[role="link"] strong');
      const author = authorEl?.textContent?.trim() || "unknown";

      // Post permalink
      const timeLink = article.querySelector(
        'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"], a[href*="/p/"]'
      );
      const url = (timeLink as HTMLAnchorElement)?.href || "";

      results.push({ author, text, url });
    });

    // Strategy 2: Fallback — text blocks for pages/simpler layouts
    if (results.length === 0) {
      const blocks = document.querySelectorAll('div[data-ad-comet-preview="message"], div[data-ad-preview="message"]');
      blocks.forEach((block) => {
        const text = block.textContent?.trim() || "";
        if (text.length >= 30) {
          results.push({ author: "unknown", text, url: "" });
        }
      });
    }

    return results;
  });

  console.log(`[url-scraper] Facebook: found ${posts.length} articles`);
  posts.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..." url=${p.url.slice(0, 80)}`);
  });

  return posts.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: new Date().toISOString(),
    engagement: 0,
  }));
}

async function extractReddit(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting Reddit posts...`);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1000);
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string; engagement: number }[] = [];

    // old.reddit.com
    document.querySelectorAll('.thing.link').forEach((thing) => {
      const titleEl = thing.querySelector('a.title');
      const authorEl = thing.querySelector('a.author');
      const scoreEl = thing.querySelector('.score.unvoted');
      const title = titleEl?.textContent?.trim() || "";
      const url = (titleEl as HTMLAnchorElement)?.href || "";
      const author = authorEl?.textContent?.trim() || "unknown";
      const score = parseInt(scoreEl?.textContent?.replace(/[^0-9-]/g, "") || "0", 10) || 0;
      if (title) results.push({ author, text: title, url, engagement: score });
    });

    // new.reddit.com
    if (results.length === 0) {
      document.querySelectorAll('article, shreddit-post, [data-testid="post-container"]').forEach((card) => {
        const titleEl = card.querySelector('h3, a[slot="title"], [data-testid="post-title"]');
        const authorEl = card.querySelector('a[href*="/user/"]');
        const text = titleEl?.textContent?.trim() || "";
        const author = authorEl?.textContent?.trim() || "unknown";
        if (text.length > 10) results.push({ author, text, url: "", engagement: 0 });
      });
    }

    return results;
  });

  console.log(`[url-scraper] Reddit: found ${posts.length} posts`);
  posts.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  return posts.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: new Date().toISOString(),
    engagement: p.engagement,
  }));
}

async function extractLinkedin(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting LinkedIn posts...`);
  await page.waitForTimeout(3000);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string }[] = [];

    document.querySelectorAll('.feed-shared-update-v2, .occludable-update, div[data-urn]').forEach((container) => {
      const textEl = container.querySelector('.feed-shared-text, .break-words, .update-components-text');
      const authorEl = container.querySelector('.feed-shared-actor__name, .update-components-actor__name');
      const linkEl = container.querySelector('a[href*="/feed/update/"]');
      const text = textEl?.textContent?.trim() || "";
      const author = authorEl?.textContent?.trim() || "unknown";
      const url = (linkEl as HTMLAnchorElement)?.href || "";
      if (text.length > 20) results.push({ author, text, url });
    });

    return results;
  });

  console.log(`[url-scraper] LinkedIn: found ${posts.length} posts`);
  posts.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  return posts.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: new Date().toISOString(),
    engagement: 0,
  }));
}

async function extractX(page: import("playwright").Page): Promise<Omit<ScrapedPost, "platform" | "source">[]> {
  console.log(`[url-scraper] Extracting X/Twitter posts...`);
  await page.waitForTimeout(3000);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1500);
  }

  const posts = await page.evaluate(() => {
    const results: { author: string; text: string; url: string }[] = [];

    document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
      const textEl = tweet.querySelector('[data-testid="tweetText"]');
      const authorEl = tweet.querySelector('a[href*="/"] div[dir="ltr"] > span');
      const linkEl = tweet.querySelector('a[href*="/status/"]');
      const text = textEl?.textContent?.trim() || "";
      const author = authorEl?.textContent?.trim() || "unknown";
      const url = (linkEl as HTMLAnchorElement)?.href || "";
      if (text.length > 10) results.push({ author, text, url });
    });

    return results;
  });

  console.log(`[url-scraper] X: found ${posts.length} tweets`);
  posts.forEach((p, i) => {
    console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
  });

  return posts.map((p) => ({
    author: p.author,
    text: p.text,
    url: p.url,
    timestamp: new Date().toISOString(),
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

  const platform = detectPlatform(targetUrl);
  if (!platform) {
    return {
      platform: "Facebook",
      posts: [],
      duration: Date.now() - start,
      errors: [`Unsupported URL. Must be Facebook, LinkedIn, Reddit, or X. Got: ${targetUrl}`],
    };
  }

  const cookiesExist = hasSavedCookies();

  console.log(`\n[url-scraper] ========================================`);
  console.log(`[url-scraper] Target URL: ${targetUrl}`);
  console.log(`[url-scraper] Platform:   ${platform}`);
  console.log(`[url-scraper] Cookies:    ${cookiesExist ? "YES — using saved login session" : "NO — scraping without login (limited)"}`);
  console.log(`[url-scraper] Headless:   ${config.headless}`);
  console.log(`[url-scraper] ========================================\n`);

  if (!cookiesExist && platform !== "Reddit") {
    console.warn(`[url-scraper] WARNING: No saved cookies. ${platform} requires login to see posts.`);
    console.warn(`[url-scraper] Run: cd scraper-service && npx ts-node src/crawler/browserAuth.ts`);
    console.warn(`[url-scraper] to open a browser, log in, and save cookies.\n`);
  }

  let context: import("playwright").BrowserContext | null = null;
  let browser: import("playwright").Browser | null = null;
  try {
    let page: import("playwright").Page;

    if (cookiesExist) {
      // Use persistent profile — contains saved login sessions
      console.log(`[url-scraper] Using persistent profile: ${getProfileDir()}`);
      context = await chromium.launchPersistentContext(getProfileDir(), {
        headless: config.headless,
        args: ["--disable-blink-features=AutomationControlled"],
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      page = context.pages()[0] || (await context.newPage());
    } else {
      // No profile — launch a plain browser
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

    // Navigate
    console.log(`[url-scraper] Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
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
      // Extract posts
      let extracted: Omit<ScrapedPost, "platform" | "source">[] = [];
      switch (platform) {
        case "Facebook":
          extracted = await extractFacebook(page);
          break;
        case "Reddit":
          extracted = await extractReddit(page);
          break;
        case "LinkedIn":
          extracted = await extractLinkedin(page);
          break;
        case "X":
          extracted = await extractX(page);
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
      console.log(`[url-scraper]   ${i + 1}. [${p.author}] ${p.text.slice(0, 120)}... -> ${p.url.slice(0, 80)}`)
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
