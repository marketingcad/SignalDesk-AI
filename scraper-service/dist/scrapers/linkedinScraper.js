"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeLinkedin = scrapeLinkedin;
const crawlee_1 = require("crawlee");
const config_1 = require("../config");
const storage_1 = require("../crawler/storage");
/**
 * LinkedIn Scraper — crawls public LinkedIn post search via Google.
 * LinkedIn blocks direct scraping without login, so we use
 * Google dorking: site:linkedin.com/posts "hiring virtual assistant"
 * Google's &tbs=qdr:w filter ensures results are from the past week.
 */
async function scrapeLinkedin() {
    const start = Date.now();
    const posts = [];
    const errors = [];
    const seen = new Set();
    (0, storage_1.useStorageDir)("linkedin");
    const queries = config_1.config.targets.linkedinSearchQueries;
    // Google dork: site:linkedin.com/posts "query"
    const urls = queries.map((q) => `https://www.google.com/search?q=site:linkedin.com/posts+"${encodeURIComponent(q)}"&tbs=qdr:w`);
    const crawler = new crawlee_1.PlaywrightCrawler({
        headless: config_1.config.headless,
        maxRequestsPerCrawl: urls.length,
        requestHandlerTimeoutSecs: 60,
        maxConcurrency: 1,
        useSessionPool: false,
        launchContext: {
            launchOptions: {
                args: [
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-setuid-sandbox",
                ],
            },
        },
        async requestHandler({ page, request, log }) {
            log.info(`Scraping LinkedIn via Google: ${request.url}`);
            // Wait for Google search results
            await page.waitForSelector("#search", { timeout: 15000 }).catch(() => { });
            await page.waitForTimeout(config_1.config.scrollDelayMs);
            // Extract Google search result entries
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
                // Only keep linkedin.com/posts URLs
                if (!item.url.includes("linkedin.com/posts"))
                    continue;
                if (seen.has(item.url))
                    continue;
                if (posts.length >= config_1.config.maxResultsPerRun)
                    break;
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Crawler error: ${msg}`);
    }
    (0, storage_1.cleanStorage)("linkedin");
    return {
        platform: "LinkedIn",
        posts: posts.slice(0, config_1.config.maxResultsPerRun),
        duration: Date.now() - start,
        errors,
    };
}
//# sourceMappingURL=linkedinScraper.js.map