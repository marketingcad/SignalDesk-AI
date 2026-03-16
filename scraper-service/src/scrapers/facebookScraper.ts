import { PlaywrightCrawler } from "crawlee";
import { config } from "../config";
import { useStorageDir, cleanStorage } from "../crawler/storage";
import { isCurrentWeek, isOlderThanCurrentWeek, resolveTimestamp } from "../utils/dateHelpers";
import type { ScrapedPost, ScrapeResult } from "../types";
import { BROWSER_ARGS } from "./browserArgs";

/**
 * Facebook Scraper — crawls publicly accessible Facebook group posts.
 *
 * Two strategies:
 * 1. Google dorking: site:facebook.com/groups "hiring virtual assistant"
 *    Returns Google-indexed group posts with direct permalinks.
 *
 * 2. Direct group URLs (from config): opens the group page and extracts
 *    individual post permalinks from div[role="article"] containers.
 *    Looks for /posts/, /permalink/, story_fbid patterns inside each post.
 *
 * NOTE: Most Facebook groups require login. Strategy 2 works best with
 * saved cookies via browserAuth. The Apify service + Chrome extension
 * handle logged-in scraping as a complement.
 */
export async function scrapeFacebook(): Promise<ScrapeResult> {
  const start = Date.now();
  const posts: ScrapedPost[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  useStorageDir("facebook");
  const searchTerms = config.targets.facebookSearchQueries;

  // Google dork for Facebook group posts (filtered to last week)
  const googleUrls: string[] = searchTerms.map(
    (q) =>
      `https://www.google.com/search?q=site:facebook.com/groups+"${encodeURIComponent(q)}"&tbs=qdr:w`
  );

  // Direct group URLs from config (these need permalink extraction)
  const directGroupUrls: string[] = config.targets.facebookGroupUrls.filter(Boolean);

  const allUrls = [...googleUrls, ...directGroupUrls];

  const crawler = new PlaywrightCrawler({
    headless: config.headless,
    maxRequestsPerCrawl: allUrls.length,
    requestHandlerTimeoutSecs: 90,
    maxConcurrency: 1,
    maxRequestRetries: 1,
    useSessionPool: false,
    browserPoolOptions: {
      retireBrowserAfterPageCount: 1,
    },
    launchContext: {
      launchOptions: {
        args: BROWSER_ARGS,
      },
    },

    async requestHandler({ page, request, log }) {
      const isGoogleSearch = request.url.includes("google.com/search");

      if (isGoogleSearch) {
        // ── Strategy 1: Google dorking ──
        log.info(`Scraping Facebook via Google: ${request.url}`);

        await page.waitForSelector("#search", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(config.scrollDelayMs);

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
          const groupMatch = item.url.match(/groups\/([^/?]+)/);
          const source = groupMatch ? `fb/${groupMatch[1]}` : "facebook-search";

          posts.push({
            platform: "Facebook",
            author: "unknown",
            text,
            url: item.url, // Google results already have direct post permalinks
            timestamp: new Date().toISOString(),
            engagement: 0,
            source,
          });
        }

        log.info(`Extracted ${items.length} Facebook results from Google`);
      } else {
        // ── Strategy 2: Direct group page — extract post permalinks ──
        log.info(`Scraping Facebook group directly: ${request.url}`);

        const baseUrl = "https://www.facebook.com";

        // Scroll to load posts, stop early on old posts
        let hitOldPost = false;
        for (let i = 0; i < 6; i++) {
          if (hitOldPost) {
            log.info(`Stopping scroll — detected posts older than current week`);
            break;
          }
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(1500);

          // Check for old posts
          const oldDetected = await page.evaluate(() => {
            const timeEls = document.querySelectorAll("abbr[data-utime]");
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
          if (oldDetected) hitOldPost = true;
        }

        // Click "See more" buttons
        try {
          const seeMoreBtns = await page.$$('div[role="button"]');
          let expanded = 0;
          for (const btn of seeMoreBtns) {
            const btnText = await btn.textContent().catch(() => "");
            if (btnText && /^see more$/i.test(btnText.trim())) {
              await btn.click().catch(() => {});
              expanded++;
              await page.waitForTimeout(300);
            }
          }
          if (expanded > 0) {
            log.info(`Expanded ${expanded} "See more" buttons`);
            await page.waitForTimeout(1000);
          }
        } catch {
          // non-critical
        }

        // Extract posts with permalinks
        const extracted = await page.evaluate((baseUrlArg: string) => {
          const results: { author: string; text: string; url: string; rawTs: string }[] = [];

          function isInsideCommentSection(el: Element, postArticle: Element): boolean {
            const closestArticle = el.closest('div[role="article"]');
            if (closestArticle && closestArticle !== postArticle) return true;
            if (el.closest("form")) return true;
            const parentList = el.closest('ul[role="list"], ul');
            if (parentList && postArticle.contains(parentList)) {
              if (parentList.querySelector('div[role="article"]')) return true;
            }
            const cc = el.closest('[aria-label*="comment" i], [aria-label*="reply" i]');
            if (cc && postArticle.contains(cc)) return true;
            return false;
          }

          function extractPermalink(article: Element): string {
            function toFullUrl(href: string): string {
              try { return new URL(href, baseUrlArg).href; }
              catch { return href.startsWith("http") ? href : `${baseUrlArg}${href}`; }
            }

            // Strategy 1: Direct permalink selectors
            const selectors = [
              'a[href*="/posts/"]',
              'a[href*="/permalink/"]',
              'a[href*="story_fbid"]',
              'a[href*="/p/"]',
              'a[href*="/groups/"][href*="/posts/"]',
            ];
            for (const sel of selectors) {
              const link = article.querySelector(sel) as HTMLAnchorElement | null;
              if (link?.href) return toFullUrl(link.href);
            }

            // Strategy 2: Timestamp links are often permalinks
            const allAnchors = article.querySelectorAll("a[href]");
            for (const link of allAnchors) {
              const href = (link as HTMLAnchorElement).href || "";
              const hasTime = link.querySelector("abbr, time, [data-utime]");
              const lt = link.textContent?.trim() || "";
              const isTimeLink = hasTime || /^\d+[hmdw]$/.test(lt) || /ago|hr|min|just now|yesterday/i.test(lt);
              if (isTimeLink && href.includes("facebook.com")) {
                if (["/posts/", "/permalink/", "story_fbid", "/p/", "/groups/"].some((p) => href.includes(p))) {
                  return href;
                }
              }
            }

            // Strategy 3: Any link with a post ID pattern
            for (const link of article.querySelectorAll('a[href*="facebook.com"]')) {
              const href = (link as HTMLAnchorElement).href;
              if (/\/(?:posts|permalink|p)\/\d+/.test(href) || /story_fbid=\d+/.test(href)) {
                return href;
              }
            }

            // Strategy 4: Aria-label links with timestamps
            for (const link of allAnchors) {
              const href = (link as HTMLAnchorElement).href || "";
              const ariaLabel = link.getAttribute("aria-label") || "";
              if (ariaLabel && href.includes("facebook.com") && /\d/.test(ariaLabel)) {
                if (href.includes("/groups/") || href.includes("/posts/") || href.includes("/permalink/") || href.includes("story_fbid")) {
                  return href;
                }
              }
            }

            // Strategy 5: Header area links
            const headerArea = article.querySelector('h2, h3, h4')?.parentElement?.parentElement;
            if (headerArea) {
              for (const link of headerArea.querySelectorAll('a[href*="facebook.com"]')) {
                const href = (link as HTMLAnchorElement).href;
                if (/\/(?:posts|permalink|p)\/\d+/.test(href) || /story_fbid/.test(href) || /\/groups\/[^/]+\/posts\//.test(href)) {
                  return href;
                }
              }
            }

            // Strategy 6: data-ft attribute (older FB markup)
            const dataFt = article.getAttribute("data-ft");
            if (dataFt) {
              try {
                const ft = JSON.parse(dataFt);
                const topLevelPostId = ft.top_level_post_id || ft.tl_objid;
                if (topLevelPostId) {
                  return `${baseUrlArg}/permalink.php?story_fbid=${topLevelPostId}&id=${ft.page_id || ft.content_owner_id_new || ""}`;
                }
              } catch { /* ignore */ }
            }

            // Strategy 7: Any link with a long numeric segment (likely a post ID)
            for (const link of allAnchors) {
              const href = (link as HTMLAnchorElement).href || "";
              if (href.includes("facebook.com") && /\/\d{10,}/.test(href)) {
                return href;
              }
            }

            return "";
          }

          // Only top-level articles (not nested comment articles)
          const allArticles = Array.from(document.querySelectorAll('div[role="article"]'));
          const topArticles = allArticles.filter(
            (a) => !a.parentElement?.closest('div[role="article"]')
          );

          topArticles.forEach((article) => {
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

            const abbrEl = article.querySelector("abbr[data-utime]") as HTMLElement | null;
            const timeEl = article.querySelector("time[datetime]") as HTMLElement | null;
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

          return results;
        }, baseUrl);

        // Resolve timestamps and filter to current week
        const groupMatch = request.url.match(/groups\/([^/?]+)/);
        const source = groupMatch ? `fb/${groupMatch[1]}` : "facebook-group";

        for (const item of extracted) {
          const resolvedTs = resolveTimestamp(item.rawTs);
          if (isOlderThanCurrentWeek(resolvedTs)) continue;
          if (!isCurrentWeek(resolvedTs)) continue;

          const postUrl = item.url || request.url;
          if (seen.has(postUrl)) continue;
          if (posts.length >= config.maxResultsPerRun) break;
          seen.add(postUrl);

          posts.push({
            platform: "Facebook",
            author: item.author,
            text: item.text,
            url: postUrl,
            timestamp: resolvedTs || new Date().toISOString(),
            engagement: 0,
            source,
          });
        }

        log.info(`Extracted ${extracted.length} articles, ${posts.length} current-week posts with permalinks`);
      }
    },

    failedRequestHandler({ request, log }, err) {
      log.error(`Failed: ${request.url} — ${err.message}`);
      errors.push(`${request.url}: ${err.message}`);
    },
  });

  try {
    await crawler.run(allUrls.map((url) => ({ url })));
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
