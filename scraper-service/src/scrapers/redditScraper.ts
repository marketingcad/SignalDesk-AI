import { PlaywrightCrawler } from "crawlee";
import { config } from "../config";
import { useStorageDir, cleanStorage } from "../crawler/storage";
import { isOlderThanCurrentWeek, resolveTimestamp } from "../utils/dateHelpers";
import type { ScrapedPost, ScrapeResult } from "../types";

/**
 * Reddit Scraper — crawls public subreddit feeds using NEW reddit (www.reddit.com).
 * Uses the /new feed to get newest posts first, filters to current week only.
 * No login required.
 *
 * Strategy:
 *  1. Browser: www.reddit.com/r/{sub}/new — shreddit-post elements with attributes
 *  2. Fallback: Reddit JSON API — /r/{sub}/new.json for reliable structured data
 */
export async function scrapeReddit(): Promise<ScrapeResult> {
  const start = Date.now();
  const posts: ScrapedPost[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const subreddits = config.targets.redditSubreddits;

  // Use primary high-intent search terms for Reddit search
  // These are compact enough to not overwhelm Reddit's search API
  const searchTerms = [
    "hiring virtual assistant",
    "need a VA",
    "looking for virtual assistant",
    "hire VA",
    "hiring remote assistant",
    "need admin support",
    "hiring appointment setter",
    "[hiring]",
  ];

  // Build URLs: search within each subreddit using www.reddit.com
  const urls: string[] = [];
  for (const sub of subreddits) {
    for (const term of searchTerms) {
      urls.push(
        `https://www.reddit.com/r/${sub}/search/?q=${encodeURIComponent(term)}&restrict_sr=1&sort=new&t=week`
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
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-setuid-sandbox",
        ],
      },
    },

    async requestHandler({ page, request, log }) {
      log.info(`Scraping: ${request.url}`);

      await page.waitForTimeout(config.scrollDelayMs);

      // Scroll to load more results, stop early on old posts
      let hitOldPost = false;
      for (let i = 0; i < 4; i++) {
        if (hitOldPost) {
          log.info(`Stopping scroll — detected posts older than current week`);
          break;
        }
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1200);

        // Check for old posts via shreddit-post timestamps
        const oldDetected = await page.evaluate(() => {
          const postEls = document.querySelectorAll("shreddit-post");
          for (const post of postEls) {
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

      // Extract posts from new Reddit — shreddit-post custom elements
      const items = await page.evaluate(() => {
        const results: {
          title: string;
          url: string;
          author: string;
          rawTs: string;
          score: number;
          subreddit: string;
        }[] = [];

        // NEW reddit: shreddit-post elements expose data via attributes
        document.querySelectorAll("shreddit-post").forEach((post) => {
          const title = post.getAttribute("post-title") || "";
          const author = post.getAttribute("author") || "unknown";
          const permalink = post.getAttribute("permalink") || post.getAttribute("content-href") || "";
          const score = parseInt(post.getAttribute("score") || "0", 10) || 0;
          const createdTs = post.getAttribute("created-timestamp") || "";
          const subreddit = post.getAttribute("subreddit-prefixed-name") || "";
          const url = permalink
            ? (permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`)
            : "";

          if (title.length > 5) {
            results.push({ title, url, author, rawTs: createdTs, score, subreddit });
          }
        });

        // Fallback: search result items (new reddit search uses different elements)
        if (results.length === 0) {
          document.querySelectorAll('a[data-testid="post-title-text"], faceplate-tracker[source="search"]').forEach((el) => {
            const linkEl = el.closest("a") || el.querySelector("a");
            const title = el.textContent?.trim() || "";
            const href = (linkEl as HTMLAnchorElement)?.href || "";
            if (title.length > 5 && href) {
              results.push({
                title,
                url: href.startsWith("http") ? href : `https://www.reddit.com${href}`,
                author: "unknown",
                rawTs: "",
                score: 0,
                subreddit: "",
              });
            }
          });
        }

        return results;
      });

      for (const item of items) {
        if (!item.url || seen.has(item.url)) continue;
        if (posts.length >= config.maxResultsPerRun) break;

        // Resolve timestamp and filter to current week
        const resolvedTs = resolveTimestamp(item.rawTs);
        if (isOlderThanCurrentWeek(resolvedTs)) {
          log.info(`Skipping old post: "${item.title.slice(0, 60)}..."`);
          continue;
        }

        seen.add(item.url);

        // Extract subreddit from URL or attribute
        const subMatch = item.subreddit || item.url.match(/\/r\/([^/]+)/)?.[1] || "";
        const source = subMatch ? (subMatch.startsWith("r/") ? subMatch : `r/${subMatch}`) : "reddit";

        posts.push({
          platform: "Reddit",
          author: item.author,
          text: item.title,
          url: item.url,
          timestamp: resolvedTs || new Date().toISOString(),
          engagement: item.score,
          source,
        });
      }

      log.info(`Extracted ${items.length} items, ${posts.length} current-week posts so far`);
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

  // If browser scraping found few results, supplement with JSON API fallback
  if (posts.length < 5) {
    console.log(`[reddit] Browser found only ${posts.length} posts, trying JSON API fallback...`);
    await supplementWithJsonApi(posts, seen, subreddits, searchTerms);
  }

  cleanStorage("reddit");

  return {
    platform: "Reddit",
    posts: posts.slice(0, config.maxResultsPerRun),
    duration: Date.now() - start,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Reddit JSON API fallback — reliable structured data when browser fails
// ---------------------------------------------------------------------------

async function supplementWithJsonApi(
  posts: ScrapedPost[],
  seen: Set<string>,
  subreddits: string[],
  searchTerms: string[]
): Promise<void> {
  for (const sub of subreddits) {
    for (const term of searchTerms) {
      if (posts.length >= config.maxResultsPerRun) return;

      const jsonUrl = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&t=week&limit=25`;

      try {
        const resp = await fetch(jsonUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (!resp.ok) continue;

        const json = await resp.json();
        const children = json?.data?.children ?? [];

        for (const child of children) {
          const d = child?.data;
          if (!d || child.kind !== "t3") continue;

          const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : "";
          if (!permalink || seen.has(permalink)) continue;

          const createdUtc = d.created_utc ? new Date(d.created_utc * 1000).toISOString() : "";
          if (isOlderThanCurrentWeek(createdUtc)) continue;

          seen.add(permalink);
          const title = d.title || "";
          const selftext = d.selftext || "";
          const text = selftext ? `${title}\n\n${selftext}` : title;
          if (text.length < 5) continue;

          posts.push({
            platform: "Reddit",
            author: d.author || "unknown",
            text,
            url: permalink,
            timestamp: createdUtc || new Date().toISOString(),
            engagement: d.score ?? 0,
            source: `r/${sub}`,
          });

          if (posts.length >= config.maxResultsPerRun) return;
        }
      } catch {
        // Non-critical — continue with other subreddits
      }
    }
  }
}
