import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement, querySelectorFallback } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "Reddit" as const;

// Selector fallback chains — self-healing against DOM changes
const SELECTORS = {
  feedContainer: '#main-content, [data-testid="subreddit-feed"], .ListingLayout-outerContainer',
  title: ['[data-testid="post-title"]', '[slot="title"]', "h1", "h3"],
  body: ['[data-testid="post-content"]', '[slot="text-body"]', ".md"],
  username: ['a[href*="/user/"]'],
  engagement: ['[data-testid="score"]', "[score]", ".score"],
  // Author flair — Reddit users sometimes set location-based flair on their profile
  authorFlair: ['[data-testid="post-author-flair"]', '.author-flair'],
};

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: SELECTORS.feedContainer,

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.tagName.toLowerCase() === "shreddit-post" ||
      (node.hasAttribute("data-testid") &&
        node.getAttribute("data-testid") === "post-container") ||
      node.querySelector("shreddit-post") !== null ||
      node.querySelector('[data-testid="post-container"]') !== null
    );
  },

  extractPost(element: HTMLElement): ExtractedPost | null {
    const postEl =
      element.tagName.toLowerCase() === "shreddit-post"
        ? element
        : element.querySelector("shreddit-post") ||
          element.querySelector('[data-testid="post-container"]');
    if (!postEl || !(postEl instanceof HTMLElement)) return null;

    // Extract title — fallback chain
    const titleEl = querySelectorFallback(postEl, SELECTORS.title, PLATFORM, "title");
    const title = getCleanText(titleEl);

    // Extract body text — fallback chain
    const bodyEl = querySelectorFallback(postEl, SELECTORS.body, PLATFORM, "body");
    const body = getCleanText(bodyEl);

    const text = `${title} ${body}`.trim().slice(0, 2000);
    if (!text) return null;

    // Username — fallback chain
    const authorEl = querySelectorFallback(postEl, SELECTORS.username, PLATFORM, "username");
    const username = authorEl
      ? getCleanText(authorEl).replace("u/", "")
      : (postEl.getAttribute("author") || "Unknown");

    // Post URL
    const permalink = postEl.getAttribute("permalink") ||
      postEl.getAttribute("content-href");
    const url = permalink
      ? `https://www.reddit.com${permalink}`
      : window.location.href;

    // Engagement (score/votes) — fallback chain
    const scoreAttr = postEl.getAttribute("score");
    let engagement = 0;
    if (scoreAttr) {
      engagement = parseInt(scoreAttr, 10) || 0;
    } else {
      const scoreEl = querySelectorFallback(postEl, SELECTORS.engagement, PLATFORM, "engagement");
      engagement = scoreEl ? parseEngagement(getCleanText(scoreEl)) : 0;
    }

    // Timestamp
    const timeEl = postEl.querySelector("time, [datetime]");
    const timestamp =
      timeEl?.getAttribute("datetime") || new Date().toISOString();

    // Subreddit name
    const pathParts = window.location.pathname.split("/");
    const subredditIdx = pathParts.indexOf("r");
    const source =
      subredditIdx >= 0
        ? `r/${pathParts[subredditIdx + 1]}`
        : "Reddit";

    // Author flair — may contain location hints (e.g. "Manila, PH", "UK-based")
    // Prefer the attribute directly from <shreddit-post>, fallback to DOM selector
    const flairAttr = postEl.getAttribute("author-flair-text");
    let authorLocation: string | undefined;
    if (flairAttr) {
      authorLocation = flairAttr;
    } else {
      const flairEl = querySelectorFallback(postEl, SELECTORS.authorFlair, PLATFORM, "authorFlair");
      authorLocation = flairEl ? getCleanText(flairEl) : undefined;
    }

    return { platform: PLATFORM, text, username, url, timestamp, engagement, source, authorLocation };
  },
};

async function init() {
  const { platformToggles } = await chrome.storage.local.get("platformToggles");
  if (platformToggles && platformToggles.Reddit === false) {
    console.log("[SignalDesk] Reddit monitoring disabled");
    return;
  }

  console.log("[SignalDesk] Reddit content script active");

  createPlatformObserver(adapter, (post) => {
    if (!passesPreFilter(post.text)) {
      console.log(`[SignalDesk] [Reddit] Post FILTERED OUT: "${post.text.slice(0, 80)}..."`);
      return;
    }

    chrome.runtime.sendMessage(
      { type: "POST_DETECTED", payload: post },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[SignalDesk] [Reddit] sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[SignalDesk] [Reddit] Background response:`, response);
        }
      }
    );
  });
}

init();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_AUTO_SCROLL") {
    startAutoScroll(message as StartAutoScrollMessage);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "STOP_AUTO_SCROLL") {
    stopAutoScroll();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
