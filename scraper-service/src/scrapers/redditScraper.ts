import { PlaywrightCrawler } from "crawlee";
import { config } from "../config";
import { useStorageDir, cleanStorage } from "../crawler/storage";
import type { ScrapedPost, ScrapeResult } from "../types";

/**
 * Reddit Scraper — crawls public subreddit search pages.
 * No login required. Uses old.reddit.com for simpler HTML structure.
 */
export async function scrapeReddit(): Promise<ScrapeResult> {
  const start = Date.now();
  const posts: ScrapedPost[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const subreddits = config.targets.redditSubreddits;
  const searchTerms = [
    "hiring virtual assistant",
    "need a VA",
    "looking for virtual assistant",
    "hire VA",
  ];

  // Build URLs: search within each subreddit
  const urls: string[] = [];
  for (const sub of subreddits) {
    for (const term of searchTerms) {
      urls.push(
        `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&t=week`
      );
    }
  }

  useStorageDir("reddit");

  const crawler = new PlaywrightCrawler({
    headless: config.headless,
    maxRequestsPerCrawl: urls.length,
    requestHandlerTimeoutSecs: 60,
    maxConcurrency: 2,
    useSessionPool: false,
    launchContext: {
      launchOptions: {
        args: ["--disable-blink-features=AutomationControlled"],
      },
    },

    async requestHandler({ page, request, log }) {
      log.info(`Scraping: ${request.url}`);

      await page.waitForTimeout(config.scrollDelayMs);

      // Scroll to load more results
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1000);
      }

      // Extract posts from old.reddit.com search results
      const items = await page.$$eval(
        "div.search-result-link",
        (elements) =>
          elements.map((el) => {
            const titleEl = el.querySelector("a.search-title");
            const authorEl = el.querySelector("a.author");
            const timeEl = el.querySelector("time");
            const scoreEl = el.querySelector("span.search-score");
            const snippetEl = el.querySelector("span.search-result-body");

            return {
              title: titleEl?.textContent?.trim() || "",
              url: (titleEl as HTMLAnchorElement)?.href || "",
              author: authorEl?.textContent?.trim() || "unknown",
              timestamp: timeEl?.getAttribute("datetime") || "",
              score: scoreEl?.textContent?.trim() || "0",
              snippet: snippetEl?.textContent?.trim() || "",
            };
          })
      );

      for (const item of items) {
        if (!item.url || seen.has(item.url)) continue;
        if (posts.length >= config.maxResultsPerRun) break;
        seen.add(item.url);

        const text = [item.title, item.snippet].filter(Boolean).join("\n\n");
        const engNum = parseInt(item.score.replace(/[^0-9]/g, ""), 10) || 0;

        // Extract subreddit from URL
        const subMatch = item.url.match(/\/r\/([^/]+)/);
        const source = subMatch ? `r/${subMatch[1]}` : "reddit";

        posts.push({
          platform: "Reddit",
          author: item.author,
          text,
          url: item.url.startsWith("http")
            ? item.url
            : `https://old.reddit.com${item.url}`,
          timestamp: item.timestamp || new Date().toISOString(),
          engagement: engNum,
          source,
        });
      }

      log.info(`Extracted ${items.length} items from ${request.url}`);
    },

    failedRequestHandler({ request, log }, err) {
      log.error(`Failed: ${request.url} — ${err.message}`);
      errors.push(`${request.url}: ${err.message}`);
    },
  });

  try {
    await crawler.run(urls.map((url) => ({ url })));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Crawler error: ${msg}`);
  }

  cleanStorage("reddit");

  return {
    platform: "Reddit",
    posts: posts.slice(0, config.maxResultsPerRun),
    duration: Date.now() - start,
    errors,
  };
}
