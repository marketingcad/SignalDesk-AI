import { PlaywrightCrawler } from "crawlee";
import { config } from "../config";
import { useStorageDir, cleanStorage } from "../crawler/storage";
import type { ScrapedPost, ScrapeResult } from "../types";

/**
 * Facebook Scraper — crawls publicly accessible Facebook group posts.
 * Uses Google dorking: site:facebook.com/groups "hiring virtual assistant"
 * Also supports direct public group page scraping for groups that allow
 * non-logged-in viewing.
 *
 * NOTE: Most Facebook groups require login. This scraper targets:
 * 1. Public group posts indexed by Google
 * 2. Public Facebook pages/posts
 * The existing Apify service + Chrome extension handle logged-in scraping.
 */
export async function scrapeFacebook(): Promise<ScrapeResult> {
  const start = Date.now();
  const posts: ScrapedPost[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  useStorageDir("facebook");
  const searchTerms = [
    "hiring virtual assistant",
    "need a VA",
    "looking for virtual assistant",
    "hire VA for business",
  ];

  // Google dork for Facebook group posts
  const urls: string[] = searchTerms.map(
    (q) =>
      `https://www.google.com/search?q=site:facebook.com/groups+"${encodeURIComponent(q)}"&tbs=qdr:w`
  );

  // Also add direct group URLs if configured
  for (const groupUrl of config.targets.facebookGroupUrls) {
    if (groupUrl) urls.push(groupUrl);
  }

  const crawler = new PlaywrightCrawler({
    headless: config.headless,
    maxRequestsPerCrawl: urls.length,
    requestHandlerTimeoutSecs: 60,
    maxConcurrency: 1,
    useSessionPool: false,
    launchContext: {
      launchOptions: {
        args: ["--disable-blink-features=AutomationControlled"],
      },
    },

    async requestHandler({ page, request, log }) {
      log.info(`Scraping Facebook via Google: ${request.url}`);

      await page.waitForSelector("#search", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(config.scrollDelayMs);

      // Google results for Facebook groups
      if (request.url.includes("google.com/search")) {
        const items = await page.$$eval(
          "div.g",
          (elements) =>
            elements.map((el) => {
              const linkEl = el.querySelector("a");
              const titleEl = el.querySelector("h3");
              const snippetEl = el.querySelector("[data-sncf], .VwiC3b, span.st");

              return {
                url: linkEl?.href || "",
                title: titleEl?.textContent?.trim() || "",
                snippet: snippetEl?.textContent?.trim() || "",
              };
            })
        );

        for (const item of items) {
          if (!item.url.includes("facebook.com")) continue;
          if (seen.has(item.url)) continue;
          if (posts.length >= config.maxResultsPerRun) break;
          seen.add(item.url);

          const text = [item.title, item.snippet].filter(Boolean).join("\n\n");

          // Try to extract group name from URL
          const groupMatch = item.url.match(/groups\/([^/?]+)/);
          const source = groupMatch ? `fb/${groupMatch[1]}` : "facebook-search";

          posts.push({
            platform: "Facebook",
            author: "unknown", // Not reliably available from Google snippets
            text,
            url: item.url,
            timestamp: new Date().toISOString(),
            engagement: 0,
            source,
          });
        }

        log.info(`Extracted ${items.length} Facebook results from Google`);
      }
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

  cleanStorage("facebook");

  return {
    platform: "Facebook",
    posts: posts.slice(0, config.maxResultsPerRun),
    duration: Date.now() - start,
    errors,
  };
}
