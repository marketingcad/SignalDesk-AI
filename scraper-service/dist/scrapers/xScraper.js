"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeX = scrapeX;
const crawlee_1 = require("crawlee");
const config_1 = require("../config");
const storage_1 = require("../crawler/storage");
/**
 * X (Twitter) Scraper — uses Google dorking for public tweet search.
 * Nitter instances are unreliable/dead, so we use:
 *   site:x.com "hiring virtual assistant"
 * to find publicly indexed tweets.
 */
async function scrapeX() {
    const start = Date.now();
    const posts = [];
    const errors = [];
    const seen = new Set();
    (0, storage_1.useStorageDir)("x");
    const queries = config_1.config.targets.xSearchQueries;
    // Google dork: site:x.com "query" — last week
    const urls = queries.map((q) => `https://www.google.com/search?q=site:x.com+"${encodeURIComponent(q)}"&tbs=qdr:w&num=20`);
    const crawler = new crawlee_1.PlaywrightCrawler({
        headless: config_1.config.headless,
        maxRequestsPerCrawl: urls.length,
        requestHandlerTimeoutSecs: 60,
        maxConcurrency: 1,
        maxRequestRetries: 1,
        useSessionPool: false,
        launchContext: {
            launchOptions: {
                args: ["--disable-blink-features=AutomationControlled"],
            },
        },
        async requestHandler({ page, request, log }) {
            log.info(`Scraping X via Google: ${request.url}`);
            // Wait for Google results
            await page.waitForSelector("#search", { timeout: 15000 }).catch(() => { });
            await page.waitForTimeout(config_1.config.scrollDelayMs);
            // Extract Google search results
            const items = await page.$$eval("div.g", (elements) => elements.map((el) => {
                const linkEl = el.querySelector("a");
                const titleEl = el.querySelector("h3");
                const snippetEl = el.querySelector("[data-sncf], .VwiC3b, span.st");
                return {
                    url: linkEl?.href || "",
                    title: titleEl?.textContent?.trim() || "",
                    snippet: snippetEl?.textContent?.trim() || "",
                };
            }));
            for (const item of items) {
                // Only keep x.com or twitter.com post URLs
                if (!item.url.match(/https?:\/\/(x\.com|twitter\.com)\/[^/]+\/status\//))
                    continue;
                if (seen.has(item.url))
                    continue;
                if (posts.length >= config_1.config.maxResultsPerRun)
                    break;
                seen.add(item.url);
                // Normalize to x.com
                const normalizedUrl = item.url.replace("twitter.com", "x.com");
                // Extract author from URL: x.com/{username}/status/...
                const authorMatch = normalizedUrl.match(/x\.com\/([^/]+)\/status/);
                const author = authorMatch ? authorMatch[1] : "unknown";
                const text = [item.title, item.snippet].filter(Boolean).join("\n\n");
                posts.push({
                    platform: "X",
                    author,
                    text,
                    url: normalizedUrl,
                    timestamp: new Date().toISOString(),
                    engagement: 0,
                    source: "x-search",
                });
            }
            log.info(`Extracted ${items.length} X/Twitter results from Google`);
        },
        failedRequestHandler({ request, log }, err) {
            log.error(`Failed: ${request.url} — ${err.message}`);
            errors.push(`${request.url}: ${err.message}`);
        },
    });
    try {
        await crawler.run(urls.map((url) => ({ url })));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Crawler error: ${msg}`);
    }
    (0, storage_1.cleanStorage)("x");
    return {
        platform: "X",
        posts: posts.slice(0, config_1.config.maxResultsPerRun),
        duration: Date.now() - start,
        errors,
    };
}
//# sourceMappingURL=xScraper.js.map