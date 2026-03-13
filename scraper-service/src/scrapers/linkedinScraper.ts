import { PlaywrightCrawler } from "crawlee";
import { config } from "../config";
import { useStorageDir, cleanStorage } from "../crawler/storage";
import type { ScrapedPost, ScrapeResult } from "../types";

/**
 * LinkedIn Scraper — crawls public LinkedIn post search via Google.
 * LinkedIn blocks direct scraping without login, so we use
 * Google dorking: site:linkedin.com/posts "hiring virtual assistant"
 * Google's &tbs=qdr:w filter ensures results are from the past week.
 */
export async function scrapeLinkedin(): Promise<ScrapeResult> {
  const start = Date.now();
  const posts: ScrapedPost[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  useStorageDir("linkedin");
  const queries = config.targets.linkedinSearchQueries;

  // Google dork: site:linkedin.com/posts "query"
  const urls: string[] = queries.map(
    (q) =>
      `https://www.google.com/search?q=site:linkedin.com/posts+"${encodeURIComponent(q)}"&tbs=qdr:w`
  );

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
      log.info(`Scraping LinkedIn via Google: ${request.url}`);

      // Wait for Google search results
      await page.waitForSelector("#search", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(config.scrollDelayMs);

      // Extract Google search result entries
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
        // Only keep linkedin.com/posts URLs
        if (!item.url.includes("linkedin.com/posts")) continue;
        if (seen.has(item.url)) continue;
        if (posts.length >= config.maxResultsPerRun) break;
        seen.add(item.url);

        // Extract author from title (usually "Author Name on LinkedIn: ...")
        const authorMatch = item.title.match(/^(.+?)(?:\s+on\s+LinkedIn|\s*[-–|])/i);
        const author = authorMatch ? authorMatch[1].trim() : "unknown";

        const text = [item.title, item.snippet].filter(Boolean).join("\n\n");

        posts.push({
          platform: "LinkedIn",
          author,
          text,
          url: item.url,
          timestamp: new Date().toISOString(),
          engagement: 0, // Not available from Google results
          source: "linkedin-search",
        });
      }

      log.info(`Extracted ${items.length} LinkedIn results from Google`);
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

  cleanStorage("linkedin");

  return {
    platform: "LinkedIn",
    posts: posts.slice(0, config.maxResultsPerRun),
    duration: Date.now() - start,
    errors,
  };
}
