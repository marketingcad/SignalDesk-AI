"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeUrl = scrapeUrl;
const playwright_1 = require("playwright");
const config_1 = require("../config");
const browserAuth_1 = require("../crawler/browserAuth");
const dateHelpers_1 = require("../utils/dateHelpers");
// ---------------------------------------------------------------------------
// Detect platform from a URL
// ---------------------------------------------------------------------------
function detectPlatform(url) {
    if (/facebook\.com|fb\.com/i.test(url))
        return "Facebook";
    if (/linkedin\.com/i.test(url))
        return "LinkedIn";
    if (/reddit\.com/i.test(url))
        return "Reddit";
    if (/x\.com|twitter\.com/i.test(url))
        return "X";
    return null;
}
// ---------------------------------------------------------------------------
// Facebook extractor — permalink-focused extraction
// ---------------------------------------------------------------------------
async function extractFacebook(page, groupUrl) {
    console.log(`[url-scraper] Extracting Facebook posts with permalink detection...`);
    let hitOldPost = false;
    // Scroll to load posts, stop early if we hit old posts
    for (let i = 0; i < 8; i++) {
        if (hitOldPost) {
            console.log(`[url-scraper]   Stopping scroll — detected posts older than current week`);
            break;
        }
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
        console.log(`[url-scraper]   Scroll ${i + 1}/8`);
        // Quick check: do we have timestamps indicating old posts?
        const oldPostDetected = await page.evaluate(() => {
            const timeEls = document.querySelectorAll('abbr[data-utime], time[datetime]');
            for (const el of timeEls) {
                const utime = el.dataset?.utime;
                if (utime) {
                    const postDate = new Date(parseInt(utime) * 1000);
                    const now = new Date();
                    const dayOfWeek = now.getUTCDay();
                    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                    const monday = new Date(now);
                    monday.setUTCDate(monday.getUTCDate() - diffToMonday);
                    monday.setUTCHours(0, 0, 0, 0);
                    if (postDate < monday)
                        return true;
                }
            }
            return false;
        });
        if (oldPostDetected)
            hitOldPost = true;
    }
    // Click "See more" buttons to expand truncated post text
    try {
        const seeMoreButtons = await page.$$('div[role="button"]');
        let expanded = 0;
        for (const btn of seeMoreButtons) {
            const text = await btn.textContent().catch(() => "");
            if (text && /^see more$/i.test(text.trim())) {
                await btn.click().catch(() => { });
                expanded++;
                await page.waitForTimeout(300);
            }
        }
        if (expanded > 0) {
            console.log(`[url-scraper] Expanded ${expanded} "See more" buttons`);
            await page.waitForTimeout(1000);
        }
    }
    catch {
        console.log(`[url-scraper] "See more" expansion skipped (non-critical)`);
    }
    // Extract the base URL for building full permalinks
    const baseUrl = new URL(groupUrl).origin; // https://www.facebook.com
    const posts = await page.evaluate((baseUrlArg) => {
        const results = [];
        // Helper: check if an element is inside the comments section
        function isInsideCommentSection(el, postArticle) {
            const closestArticle = el.closest('div[role="article"]');
            if (closestArticle && closestArticle !== postArticle)
                return true;
            if (el.closest("form"))
                return true;
            const parentList = el.closest('ul[role="list"], ul');
            if (parentList && postArticle.contains(parentList)) {
                if (parentList.querySelector('div[role="article"]'))
                    return true;
            }
            const commentContainer = el.closest('[aria-label*="comment" i], [aria-label*="Comment" i], [aria-label*="reply" i], [aria-label*="Reply" i]');
            if (commentContainer && postArticle.contains(commentContainer))
                return true;
            return false;
        }
        /**
         * Extract permalink from a post article element.
         * Facebook uses several URL patterns for post permalinks:
         *   /posts/{postId}
         *   /permalink/{postId}
         *   story_fbid=...
         *   /p/{postId}
         *   /groups/{groupId}/posts/{postId}
         * We look for <a> tags containing these patterns.
         */
        function extractPermalink(article) {
            function toFullUrl(href) {
                try {
                    return new URL(href, baseUrlArg).href;
                }
                catch {
                    return href.startsWith("http") ? href : `${baseUrlArg}${href}`;
                }
            }
            // Strategy 1: Direct permalink selectors (most reliable)
            const permalinkSelectors = [
                'a[href*="/posts/"]',
                'a[href*="/permalink/"]',
                'a[href*="story_fbid"]',
                'a[href*="/p/"]',
                'a[href*="/groups/"][href*="/posts/"]',
            ];
            for (const selector of permalinkSelectors) {
                const link = article.querySelector(selector);
                if (link?.href)
                    return toFullUrl(link.href);
            }
            // Strategy 2: Timestamp links — Facebook often makes the timestamp a permalink
            const allAnchors = article.querySelectorAll('a[href]');
            for (const link of allAnchors) {
                const href = link.href || "";
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
            // Strategy 3: Any link with a Facebook post ID pattern
            for (const link of article.querySelectorAll('a[href*="facebook.com"]')) {
                const href = link.href;
                if (/\/(?:posts|permalink|p)\/\d+/.test(href) || /story_fbid=\d+/.test(href)) {
                    return href;
                }
            }
            // Strategy 4: Aria-label links — FB wraps timestamps in links with aria-label
            for (const link of allAnchors) {
                const href = link.href || "";
                const ariaLabel = link.getAttribute("aria-label") || "";
                // Timestamp aria-labels often contain date patterns or relative times
                if (ariaLabel && href.includes("facebook.com") && /\d/.test(ariaLabel)) {
                    if (href.includes("/groups/") || href.includes("/posts/") || href.includes("/permalink/") || href.includes("story_fbid")) {
                        return href;
                    }
                }
            }
            // Strategy 5: Look for hidden/nested links in the header area of the post
            // Modern Facebook puts permalinks in the top section near author name
            const headerArea = article.querySelector('h2, h3, h4, [data-ad-preview="message"]')?.parentElement?.parentElement;
            if (headerArea) {
                for (const link of headerArea.querySelectorAll('a[href*="facebook.com"]')) {
                    const href = link.href;
                    if (/\/(?:posts|permalink|p)\/\d+/.test(href) || /story_fbid/.test(href) || /\/groups\/[^/]+\/posts\//.test(href)) {
                        return href;
                    }
                }
            }
            // Strategy 6: data-ft attribute (older FB markup) may contain post IDs
            const dataFt = article.getAttribute("data-ft");
            if (dataFt) {
                try {
                    const ft = JSON.parse(dataFt);
                    const topLevelPostId = ft.top_level_post_id || ft.tl_objid;
                    if (topLevelPostId) {
                        return `${baseUrlArg}/permalink.php?story_fbid=${topLevelPostId}&id=${ft.page_id || ft.content_owner_id_new || ""}`;
                    }
                }
                catch { /* ignore parse errors */ }
            }
            // Strategy 7: Broadest search — any link whose path has a long numeric segment (likely a post ID)
            for (const link of allAnchors) {
                const href = link.href || "";
                if (href.includes("facebook.com") && /\/\d{10,}/.test(href)) {
                    return href;
                }
            }
            return "";
        }
        // Strategy 1: div[role="article"] — group/feed posts
        // Only top-level articles (not nested comment articles)
        const allArticles = Array.from(document.querySelectorAll('div[role="article"]'));
        const articles = allArticles.filter((a) => !a.parentElement?.closest('div[role="article"]'));
        articles.forEach((article) => {
            // Collect text from div[dir="auto"] that belong to the POST, not comments
            const textEls = article.querySelectorAll('div[dir="auto"]');
            let text = "";
            textEls.forEach((el) => {
                if (isInsideCommentSection(el, article))
                    return;
                const t = el.textContent?.trim() || "";
                if (t.length > 15 && !text.includes(t)) {
                    text += (text ? "\n" : "") + t;
                }
            });
            if (text.length < 20)
                return;
            // Author — try heading links first (most reliable), then strong inside links
            const authorEl = article.querySelector('h2 a, h3 a, h4 a, strong a, a[role="link"] > strong, a[role="link"] span[dir="auto"]');
            const author = authorEl?.textContent?.trim() || "unknown";
            // *** PERMALINK EXTRACTION — the key improvement ***
            const url = extractPermalink(article);
            // Timestamp
            const abbrEl = article.querySelector('abbr[data-utime]');
            const timeEl = article.querySelector('time[datetime]');
            let rawTs = "";
            if (abbrEl?.dataset?.utime) {
                rawTs = new Date(parseInt(abbrEl.dataset.utime) * 1000).toISOString();
            }
            else if (timeEl?.getAttribute("datetime")) {
                rawTs = timeEl.getAttribute("datetime") || "";
            }
            else {
                const relEl = article.querySelector('abbr, time, [aria-label*="ago"], [title*="ago"]');
                rawTs = relEl?.getAttribute("aria-label") || relEl?.getAttribute("title") || relEl?.textContent?.trim() || "";
            }
            results.push({ author, text, url, rawTs });
        });
        // Strategy 2: Fallback — text blocks for pages/simpler layouts
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
    // Resolve relative timestamps and filter to current week
    const resolved = posts.map((p) => ({
        ...p,
        resolvedTs: (0, dateHelpers_1.resolveTimestamp)(p.rawTs),
    }));
    const filtered = resolved.filter((p) => (0, dateHelpers_1.isCurrentWeek)(p.resolvedTs));
    // Log early-stop stats
    const oldCount = resolved.filter((p) => (0, dateHelpers_1.isOlderThanCurrentWeek)(p.resolvedTs)).length;
    console.log(`[url-scraper] Facebook: found ${posts.length} articles, ${filtered.length} from current week, ${oldCount} older (skipped)`);
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
// Reddit extractor — uses NEW reddit interface (www.reddit.com)
// ---------------------------------------------------------------------------
async function extractReddit(page, targetUrl) {
    console.log(`[url-scraper] Extracting Reddit posts (new interface)...`);
    // Check for Reddit block / interstitial pages
    const pageContent = await page.content();
    const isBlocked = pageContent.includes("whoa there, pardner") ||
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
                    if (postDate < monday)
                        return true;
                }
            }
            return false;
        });
        if (oldDetected)
            hitOldPost = true;
    }
    const posts = await page.evaluate(() => {
        const results = [];
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
            if (text.length > 5)
                results.push({ author, text, url, engagement: score, rawTs: createdTs });
        });
        // Fallback: article / data-testid containers (new reddit alternative layout)
        if (results.length === 0) {
            document.querySelectorAll('article, [data-testid="post-container"]').forEach((card) => {
                const titleEl = card.querySelector('h3, a[slot="title"], [data-testid="post-title"]');
                const authorEl = card.querySelector('a[href*="/user/"]');
                const timeEl = card.querySelector("faceplate-timeago, time[datetime]");
                const linkEl = card.querySelector('a[href*="/comments/"]');
                const text = titleEl?.textContent?.trim() || "";
                const author = authorEl?.textContent?.trim() || "unknown";
                const tsAttr = timeEl?.getAttribute("ts");
                const rawTs = tsAttr
                    ? new Date(parseInt(tsAttr)).toISOString()
                    : (timeEl?.getAttribute("datetime") || "");
                const url = linkEl?.href || "";
                if (text.length > 10)
                    results.push({ author, text, url, engagement: 0, rawTs });
            });
        }
        return results;
    });
    // Resolve timestamps and filter to current week
    const resolved = posts.map((p) => ({
        ...p,
        resolvedTs: (0, dateHelpers_1.resolveTimestamp)(p.rawTs),
    }));
    const filtered = resolved.filter((p) => (0, dateHelpers_1.isCurrentWeek)(p.resolvedTs));
    const oldCount = resolved.filter((p) => (0, dateHelpers_1.isOlderThanCurrentWeek)(p.resolvedTs)).length;
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
async function extractRedditViaJson(originalUrl) {
    // Ensure we use www.reddit.com (not old.reddit.com)
    let jsonUrl = originalUrl.replace(/old\.reddit\.com/i, "www.reddit.com");
    // Append /new.json if this is a subreddit URL (to get new posts only)
    if (/\/r\/[^/]+\/?$/.test(jsonUrl)) {
        jsonUrl = jsonUrl.replace(/\/+$/, "") + "/new.json";
    }
    else {
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
        const results = [];
        for (const child of listing) {
            const d = child?.data;
            if (!d || child.kind !== "t3")
                continue; // t3 = link/post
            const title = d.title || "";
            const selftext = d.selftext || "";
            const text = selftext ? `${title}\n\n${selftext}` : title;
            if (text.length < 5)
                continue;
            const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : "";
            const createdUtc = d.created_utc ? new Date(d.created_utc * 1000).toISOString() : "";
            // Filter to current week
            if ((0, dateHelpers_1.isOlderThanCurrentWeek)(createdUtc)) {
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[url-scraper] Reddit JSON fallback failed: ${msg}`);
        return [];
    }
}
// ---------------------------------------------------------------------------
// LinkedIn extractor
// ---------------------------------------------------------------------------
async function extractLinkedin(page) {
    console.log(`[url-scraper] Extracting LinkedIn posts...`);
    await page.waitForTimeout(3000);
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
    }
    const posts = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('.feed-shared-update-v2, .occludable-update, div[data-urn]').forEach((container) => {
            const textEl = container.querySelector('.feed-shared-text, .break-words, .update-components-text');
            const authorEl = container.querySelector('.feed-shared-actor__name, .update-components-actor__name');
            const linkEl = container.querySelector('a[href*="/feed/update/"]');
            const timeEl = container.querySelector('time[datetime]');
            const relEl = container.querySelector('.feed-shared-actor__sub-description, .update-components-actor__meta');
            const text = textEl?.textContent?.trim() || "";
            const author = authorEl?.textContent?.trim() || "unknown";
            const url = linkEl?.href || "";
            const rawTs = timeEl?.getAttribute("datetime") || relEl?.textContent?.trim() || "";
            if (text.length > 20)
                results.push({ author, text, url, rawTs });
        });
        return results;
    });
    // Filter to current week
    const resolved = posts.map((p) => ({
        ...p,
        resolvedTs: (0, dateHelpers_1.resolveTimestamp)(p.rawTs),
    }));
    const filtered = resolved.filter((p) => (0, dateHelpers_1.isCurrentWeek)(p.resolvedTs));
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
async function extractX(page) {
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
                    if (postDate < monday)
                        return true;
                }
            }
            return false;
        });
        if (oldDetected)
            hitOldPost = true;
    }
    const posts = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
            const textEl = tweet.querySelector('[data-testid="tweetText"]');
            const authorEl = tweet.querySelector('a[href*="/"] div[dir="ltr"] > span');
            const linkEl = tweet.querySelector('a[href*="/status/"]');
            const timeEl = tweet.querySelector('time[datetime]');
            const text = textEl?.textContent?.trim() || "";
            const author = authorEl?.textContent?.trim() || "unknown";
            const url = linkEl?.href || "";
            const rawTs = timeEl?.getAttribute("datetime") || "";
            if (text.length > 10)
                results.push({ author, text, url, rawTs });
        });
        return results;
    });
    // Filter to current week
    const resolved = posts.map((p) => ({
        ...p,
        resolvedTs: (0, dateHelpers_1.resolveTimestamp)(p.rawTs),
    }));
    const filtered = resolved.filter((p) => (0, dateHelpers_1.isCurrentWeek)(p.resolvedTs));
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
async function extractGeneric(page) {
    console.log(`[url-scraper] Extracting posts from generic page...`);
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
    }
    const posts = await page.evaluate(() => {
        const results = [];
        const seen = new Set();
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
            if (!text && headingEl)
                text = headingEl.textContent?.trim() || "";
            if (text.length < 20)
                return;
            const textKey = text.slice(0, 200);
            if (seen.has(textKey))
                return;
            seen.add(textKey);
            const linkEl = article.querySelector('a[href]');
            const url = linkEl?.href || "";
            const authorEl = article.querySelector('[rel="author"], .author, .byline, .username, a[href*="/user/"], a[href*="/profile/"]');
            const author = authorEl?.textContent?.trim() || "unknown";
            const timeEl = article.querySelector('time[datetime]');
            const rawTs = timeEl?.getAttribute("datetime") || "";
            results.push({ author, text, url, rawTs });
        });
        // Strategy 2: post-like containers
        if (results.length === 0) {
            document.querySelectorAll('.post, .comment, .entry, .thread, .message, [class*="post-"], [class*="Post"]').forEach((container) => {
                const text = container.textContent?.trim() || "";
                if (text.length < 30 || text.length > 10000)
                    return;
                const textKey = text.slice(0, 200);
                if (seen.has(textKey))
                    return;
                seen.add(textKey);
                const linkEl = container.querySelector('a[href]');
                const authorEl = container.querySelector('.author, .username, .user, [class*="author"], [class*="user"]');
                const timeEl = container.querySelector('time[datetime]');
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
                if (title.length < 10)
                    return;
                let body = "";
                let sibling = heading.nextElementSibling;
                while (sibling && !['H1', 'H2', 'H3'].includes(sibling.tagName)) {
                    if (sibling.tagName === 'P' || sibling.tagName === 'DIV') {
                        const t = sibling.textContent?.trim() || "";
                        if (t.length > 15)
                            body += (body ? "\n" : "") + t;
                    }
                    sibling = sibling.nextElementSibling;
                }
                const text = body ? `${title}\n\n${body}` : title;
                if (text.length < 30)
                    return;
                const textKey = text.slice(0, 200);
                if (seen.has(textKey))
                    return;
                seen.add(textKey);
                const linkEl = heading.querySelector('a[href]');
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
async function scrapeUrl(targetUrl) {
    const start = Date.now();
    const posts = [];
    const errors = [];
    const platform = detectPlatform(targetUrl) ?? "Other";
    const cookiesExist = (0, browserAuth_1.hasSavedCookies)();
    console.log(`\n[url-scraper] ========================================`);
    console.log(`[url-scraper] Target URL: ${targetUrl}`);
    console.log(`[url-scraper] Platform:   ${platform}`);
    console.log(`[url-scraper] Cookies:    ${cookiesExist ? "YES — using saved login session" : "NO — scraping without login (limited)"}`);
    console.log(`[url-scraper] Headless:   ${config_1.config.headless}`);
    console.log(`[url-scraper] ========================================\n`);
    if (!cookiesExist && platform !== "Reddit" && platform !== "Other") {
        console.warn(`[url-scraper] WARNING: No saved cookies. ${platform} requires login to see posts.`);
        console.warn(`[url-scraper] Run: cd scraper-service && npx ts-node src/crawler/browserAuth.ts`);
        console.warn(`[url-scraper] to open a browser, log in, and save cookies.\n`);
    }
    let context = null;
    let browser = null;
    try {
        let page;
        if (cookiesExist && (0, browserAuth_1.shouldUseStorageState)()) {
            const statePath = (0, browserAuth_1.getStorageState)();
            console.log(`[url-scraper] Using storageState: ${statePath ? "yes" : "none"}`);
            browser = await playwright_1.chromium.launch({
                headless: config_1.config.headless,
                args: ["--disable-blink-features=AutomationControlled"],
            });
            context = await browser.newContext({
                storageState: statePath,
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });
            page = await context.newPage();
        }
        else if (cookiesExist) {
            console.log(`[url-scraper] Using persistent profile: ${(0, browserAuth_1.getProfileDir)()}`);
            context = await playwright_1.chromium.launchPersistentContext((0, browserAuth_1.getProfileDir)(), {
                headless: config_1.config.headless,
                args: ["--disable-blink-features=AutomationControlled"],
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });
            page = context.pages()[0] || (await context.newPage());
        }
        else {
            browser = await playwright_1.chromium.launch({
                headless: config_1.config.headless,
                args: ["--disable-blink-features=AutomationControlled"],
            });
            context = await browser.newContext({
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
        const isLoginPage = finalUrl.includes("/login") ||
            finalUrl.includes("/checkpoint") ||
            finalUrl.includes("/signin") ||
            pageTitle.toLowerCase().includes("log in");
        if (isLoginPage) {
            console.warn(`[url-scraper] REDIRECTED TO LOGIN — cannot scrape without cookies`);
            errors.push(`${platform} requires login. Run: cd scraper-service && npx ts-node src/crawler/browserAuth.ts`);
        }
        else {
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
            }
            else if (platform === "LinkedIn") {
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
            }
            else if (platform === "X") {
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
            let extracted = [];
            switch (platform) {
                case "Facebook":
                    extracted = await extractFacebook(page, targetUrl);
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Scraper error: ${msg}`);
        console.error(`[url-scraper] Exception: ${msg}`);
    }
    finally {
        if (context)
            await context.close().catch(() => { });
        if (browser)
            await browser.close().catch(() => { });
    }
    // Result summary
    console.log(`\n[url-scraper] ========== RESULT ==========`);
    console.log(`[url-scraper] Posts found: ${posts.length}`);
    console.log(`[url-scraper] Errors: ${errors.length}`);
    console.log(`[url-scraper] Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    if (posts.length > 0) {
        console.log(`[url-scraper] Posts:`);
        posts.forEach((p, i) => console.log(`[url-scraper]   ${i + 1}. [${p.author}] ${p.text.slice(0, 120)}... -> ${p.url.slice(0, 100)}`));
    }
    if (errors.length > 0) {
        console.log(`[url-scraper] Errors:`);
        errors.forEach((e) => console.log(`[url-scraper]   - ${e}`));
    }
    console.log(`[url-scraper] ===========================\n`);
    return {
        platform,
        posts: posts.slice(0, config_1.config.maxResultsPerRun),
        duration: Date.now() - start,
        errors,
    };
}
//# sourceMappingURL=urlScraper.js.map