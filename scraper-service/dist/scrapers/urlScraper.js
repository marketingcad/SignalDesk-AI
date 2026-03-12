"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeUrl = scrapeUrl;
const playwright_1 = require("playwright");
const config_1 = require("../config");
const browserAuth_1 = require("../crawler/browserAuth");
// ---------------------------------------------------------------------------
// Date helpers — filter posts to current month only
// ---------------------------------------------------------------------------
function isCurrentMonth(ts) {
    if (!ts)
        return true; // no date found → keep post (don't discard valid leads)
    const now = new Date();
    const d = new Date(ts);
    if (isNaN(d.getTime()))
        return true; // unparseable → keep
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
/**
 * Parse relative time strings ("2h", "3 days ago", "1w", "just now") → ISO string.
 * Returns null if the string can't be parsed.
 */
function parseRelativeTs(text) {
    if (!text)
        return null;
    const now = new Date();
    const s = text.toLowerCase().trim();
    if (/^(just now|now|moment|seconds? ago)/.test(s))
        return now.toISOString();
    if (s === "yesterday") {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d.toISOString();
    }
    const m = s.match(/(\d+)\s*(s(?:ec)?|m(?:in)?(?!o)|h(?:r|our)?|d(?:ay)?|w(?:k|eek)?|mo(?:nth)?|y(?:r|ear)?)/);
    if (!m)
        return null;
    const n = parseInt(m[1]);
    const unit = m[2];
    const d = new Date(now);
    if (/^s/.test(unit))
        d.setSeconds(d.getSeconds() - n);
    else if (/^m/.test(unit))
        d.setMinutes(d.getMinutes() - n);
    else if (/^h/.test(unit))
        d.setHours(d.getHours() - n);
    else if (/^d/.test(unit))
        d.setDate(d.getDate() - n);
    else if (/^w/.test(unit))
        d.setDate(d.getDate() - n * 7);
    else if (/^mo/.test(unit))
        d.setMonth(d.getMonth() - n);
    else if (/^y/.test(unit))
        d.setFullYear(d.getFullYear() - n);
    else
        return null;
    return d.toISOString();
}
// ---------------------------------------------------------------------------
/**
 * Detect platform from a URL.
 */
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
// Platform-specific extractors
// ---------------------------------------------------------------------------
async function extractFacebook(page) {
    console.log(`[url-scraper] Extracting Facebook posts...`);
    // Scroll to load posts
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
        console.log(`[url-scraper]   Scroll ${i + 1}/5`);
    }
    // Click "See more" buttons to expand truncated post text.
    // Without this, long posts are hidden and we'd only get comment text.
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
    const posts = await page.evaluate(() => {
        const results = [];
        // Helper: check if an element is inside the comments section.
        // Facebook comments live inside: nested div[role="article"], elements below
        // the comment form, or inside list items (ul > li) after the post content.
        function isInsideCommentSection(el, postArticle) {
            // Inside a nested article (comment bubble)
            const closestArticle = el.closest('div[role="article"]');
            if (closestArticle && closestArticle !== postArticle)
                return true;
            // Inside a form (comment input area)
            if (el.closest("form"))
                return true;
            // Inside a list that contains comments (ul with role="list" or plain ul after content)
            const parentList = el.closest('ul[role="list"], ul');
            if (parentList && postArticle.contains(parentList)) {
                // Check if this list contains nested articles (comment list)
                if (parentList.querySelector('div[role="article"]'))
                    return true;
            }
            // Inside an element with comment-related aria labels
            const commentContainer = el.closest('[aria-label*="comment" i], [aria-label*="Comment" i], [aria-label*="reply" i], [aria-label*="Reply" i]');
            if (commentContainer && postArticle.contains(commentContainer))
                return true;
            return false;
        }
        // Strategy 1: div[role="article"] — group/feed posts
        // Only top-level articles (comments are nested div[role="article"] inside the post)
        const allArticles = Array.from(document.querySelectorAll('div[role="article"]'));
        const articles = allArticles.filter((a) => !a.parentElement?.closest('div[role="article"]'));
        articles.forEach((article) => {
            // Collect text from div[dir="auto"] that belong to the POST, not comments.
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
            // Post permalink
            const timeLink = article.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"], a[href*="/p/"]');
            const url = timeLink?.href || "";
            // Timestamp — try abbr[data-utime] (unix seconds), then time[datetime], then relative text
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
                // Relative time text as fallback ("2 hours ago", "Yesterday", etc.)
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
    });
    // Resolve relative timestamps and filter to current month
    const filtered = posts
        .map((p) => {
        const ts = /^\d{4}-/.test(p.rawTs) ? p.rawTs : (parseRelativeTs(p.rawTs) ?? "");
        return { ...p, resolvedTs: ts };
    })
        .filter((p) => isCurrentMonth(p.resolvedTs));
    console.log(`[url-scraper] Facebook: found ${posts.length} articles, ${filtered.length} from current month`);
    filtered.forEach((p, i) => {
        console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..." url=${p.url.slice(0, 80)}`);
    });
    return filtered.map((p) => ({
        author: p.author,
        text: p.text,
        url: p.url,
        timestamp: p.resolvedTs || new Date().toISOString(),
        engagement: 0,
    }));
}
async function extractReddit(page) {
    console.log(`[url-scraper] Extracting Reddit posts...`);
    // Check for Reddit block / interstitial pages
    const pageContent = await page.content();
    const isBlocked = pageContent.includes("whoa there, pardner") ||
        pageContent.includes("you've been blocked") ||
        pageContent.includes("cdn-cgi/challenge") ||
        pageContent.includes("Request blocked");
    if (isBlocked) {
        console.warn(`[url-scraper] Reddit appears to be blocking the request (anti-bot page detected)`);
    }
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1000);
    }
    const posts = await page.evaluate(() => {
        const results = [];
        // old.reddit.com — subreddit listing + search results
        // .thing.link matches posts on both listing pages and search result pages
        document.querySelectorAll('.thing.link, div.search-result-link').forEach((thing) => {
            const titleEl = thing.querySelector('a.title, a.search-title');
            const authorEl = thing.querySelector('a.author');
            const scoreEl = thing.querySelector('.score.unvoted, span.search-score');
            const timeEl = thing.querySelector('time[datetime], time[title]');
            const title = titleEl?.textContent?.trim() || "";
            const url = titleEl?.href || "";
            const author = authorEl?.textContent?.trim() || "unknown";
            const score = parseInt(scoreEl?.textContent?.replace(/[^0-9-]/g, "") || "0", 10) || 0;
            const rawTs = timeEl?.getAttribute("datetime") || timeEl?.getAttribute("title") || "";
            if (title)
                results.push({ author, text: title, url, engagement: score, rawTs });
        });
        // new.reddit.com fallback — try to read shreddit-post attributes directly
        // (shadow DOM prevents querySelector from reaching inside, but attributes are on the host element)
        if (results.length === 0) {
            document.querySelectorAll('shreddit-post').forEach((post) => {
                const text = post.getAttribute("post-title") || "";
                const author = post.getAttribute("author") || "unknown";
                const permalink = post.getAttribute("permalink") || post.getAttribute("content-href") || "";
                const score = parseInt(post.getAttribute("score") || "0", 10) || 0;
                const createdTs = post.getAttribute("created-timestamp") || "";
                const url = permalink ? `https://www.reddit.com${permalink}` : "";
                if (text.length > 5)
                    results.push({ author, text, url, engagement: score, rawTs: createdTs });
            });
        }
        // new.reddit.com fallback 2 — article / data-testid containers
        if (results.length === 0) {
            document.querySelectorAll('article, [data-testid="post-container"]').forEach((card) => {
                const titleEl = card.querySelector('h3, a[slot="title"], [data-testid="post-title"]');
                const authorEl = card.querySelector('a[href*="/user/"]');
                const timeEl = card.querySelector('faceplate-timeago, time[datetime]');
                const text = titleEl?.textContent?.trim() || "";
                const author = authorEl?.textContent?.trim() || "unknown";
                const tsAttr = timeEl?.getAttribute("ts");
                const rawTs = tsAttr
                    ? new Date(parseInt(tsAttr)).toISOString()
                    : (timeEl?.getAttribute("datetime") || "");
                if (text.length > 10)
                    results.push({ author, text, url: "", engagement: 0, rawTs });
            });
        }
        return results;
    });
    // Resolve timestamps (no month filter — manual URL scraping should return all visible posts)
    const resolved = posts.map((p) => {
        const ts = /^\d{4}-/.test(p.rawTs) ? p.rawTs : (parseRelativeTs(p.rawTs) ?? "");
        return { ...p, resolvedTs: ts };
    });
    console.log(`[url-scraper] Reddit: found ${resolved.length} posts`);
    resolved.forEach((p, i) => {
        console.log(`[url-scraper]   ${i + 1}. [${p.author}] "${p.text.slice(0, 120)}..."`);
    });
    return resolved.map((p) => ({
        author: p.author,
        text: p.text,
        url: p.url,
        timestamp: p.resolvedTs || new Date().toISOString(),
        engagement: p.engagement,
    }));
}
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
            // LinkedIn time: <time datetime="ISO"> or sub-description with relative text
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
    // Filter to current month
    const filtered = posts
        .map((p) => {
        const ts = /^\d{4}-/.test(p.rawTs) ? p.rawTs : (parseRelativeTs(p.rawTs) ?? "");
        return { ...p, resolvedTs: ts };
    })
        .filter((p) => isCurrentMonth(p.resolvedTs));
    console.log(`[url-scraper] LinkedIn: found ${posts.length} posts, ${filtered.length} from current month`);
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
async function extractX(page) {
    console.log(`[url-scraper] Extracting X/Twitter posts...`);
    await page.waitForTimeout(3000);
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
    }
    const posts = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
            const textEl = tweet.querySelector('[data-testid="tweetText"]');
            const authorEl = tweet.querySelector('a[href*="/"] div[dir="ltr"] > span');
            const linkEl = tweet.querySelector('a[href*="/status/"]');
            // X always has <time datetime="ISO"> inside the tweet
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
    // Filter to current month
    const filtered = posts
        .map((p) => {
        const ts = /^\d{4}-/.test(p.rawTs) ? p.rawTs : (parseRelativeTs(p.rawTs) ?? "");
        return { ...p, resolvedTs: ts };
    })
        .filter((p) => isCurrentMonth(p.resolvedTs));
    console.log(`[url-scraper] X: found ${posts.length} tweets, ${filtered.length} from current month`);
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
async function extractGeneric(page) {
    console.log(`[url-scraper] Extracting posts from generic page...`);
    // Scroll to load dynamic content
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
    }
    const posts = await page.evaluate(() => {
        const results = [];
        const seen = new Set();
        // Strategy 1: article elements (blogs, news, forums)
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
        // Strategy 2: post-like containers (forums, community pages)
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
        // Strategy 3: heading + paragraph blocks (general pages)
        if (results.length === 0) {
            document.querySelectorAll('h1, h2, h3').forEach((heading) => {
                const title = heading.textContent?.trim() || "";
                if (title.length < 10)
                    return;
                // Gather sibling paragraphs
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
// Reddit JSON API fallback — works when old.reddit.com blocks the browser
// ---------------------------------------------------------------------------
async function extractRedditViaJson(originalUrl) {
    // Normalize to www.reddit.com and append .json
    let jsonUrl = originalUrl.replace(/old\.reddit\.com/i, "www.reddit.com");
    // Remove trailing slash, then append .json
    jsonUrl = jsonUrl.replace(/\/+$/, "") + ".json";
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
        // Subreddit listing: json.data.children[]
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
            results.push({
                author: d.author || "unknown",
                text,
                url: permalink,
                timestamp: createdUtc || new Date().toISOString(),
                engagement: d.score ?? 0,
            });
        }
        console.log(`[url-scraper] Reddit JSON fallback: found ${results.length} posts`);
        return results;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[url-scraper] Reddit JSON fallback failed: ${msg}`);
        return [];
    }
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
            // Server mode — use portable storageState (env var or JSON file)
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
            // Local dev — use persistent browser profile
            console.log(`[url-scraper] Using persistent profile: ${(0, browserAuth_1.getProfileDir)()}`);
            context = await playwright_1.chromium.launchPersistentContext((0, browserAuth_1.getProfileDir)(), {
                headless: config_1.config.headless,
                args: ["--disable-blink-features=AutomationControlled"],
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });
            page = context.pages()[0] || (await context.newPage());
        }
        else {
            // No profile — launch a plain browser
            browser = await playwright_1.chromium.launch({
                headless: config_1.config.headless,
                args: ["--disable-blink-features=AutomationControlled"],
            });
            context = await browser.newContext({
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });
            page = await context.newPage();
        }
        // Rewrite Reddit URLs to old.reddit.com for reliable scraping
        // (new Reddit uses Shadow DOM web components that selectors can't pierce)
        let navigateUrl = targetUrl;
        if (platform === "Reddit" && /www\.reddit\.com/i.test(targetUrl)) {
            navigateUrl = targetUrl.replace(/www\.reddit\.com/i, "old.reddit.com");
            console.log(`[url-scraper] Rewriting Reddit URL to old.reddit.com for reliable scraping`);
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
            // Extract posts
            let extracted = [];
            switch (platform) {
                case "Facebook":
                    extracted = await extractFacebook(page);
                    break;
                case "Reddit":
                    extracted = await extractReddit(page);
                    // If old.reddit.com returned 0 posts, try Reddit JSON API as fallback
                    if (extracted.length === 0) {
                        console.log(`[url-scraper] old.reddit.com returned 0 posts, trying Reddit JSON API fallback...`);
                        extracted = await extractRedditViaJson(targetUrl);
                    }
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
        posts.forEach((p, i) => console.log(`[url-scraper]   ${i + 1}. [${p.author}] ${p.text.slice(0, 120)}... -> ${p.url.slice(0, 80)}`));
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