import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "Reddit" as const;

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: '#main-content, [data-testid="subreddit-feed"], .ListingLayout-outerContainer',

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    // Reddit uses custom elements (shreddit-post) and data-testid attributes
    return (
      node.tagName.toLowerCase() === "shreddit-post" ||
      node.hasAttribute("data-testid") &&
        node.getAttribute("data-testid") === "post-container" ||
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

    // Extract title
    const titleEl = postEl.querySelector(
      '[data-testid="post-title"], [slot="title"], h1, h3'
    );
    const title = getCleanText(titleEl as HTMLElement);

    // Extract body text
    const bodyEl = postEl.querySelector(
      '[data-testid="post-content"], [slot="text-body"], .md'
    );
    const body = getCleanText(bodyEl as HTMLElement);

    const text = `${title} ${body}`.trim().slice(0, 2000);
    if (!text) return null;

    // Username
    const authorEl = postEl.querySelector('a[href*="/user/"]');
    const username = authorEl
      ? getCleanText(authorEl as HTMLElement).replace("u/", "")
      : (postEl.getAttribute("author") || "Unknown");

    // Post URL
    const permalink = postEl.getAttribute("permalink") ||
      postEl.getAttribute("content-href");
    const url = permalink
      ? `https://www.reddit.com${permalink}`
      : window.location.href;

    // Engagement (score/votes)
    const scoreEl = postEl.querySelector(
      '[data-testid="score"], [score], .score'
    );
    const scoreAttr = postEl.getAttribute("score");
    const engagement = scoreAttr
      ? parseInt(scoreAttr, 10)
      : scoreEl
        ? parseEngagement(getCleanText(scoreEl as HTMLElement))
        : 0;

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

    return { platform: PLATFORM, text, username, url, timestamp, engagement, source };
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

    console.log(`[SignalDesk] [Reddit] Sending to background: ${post.username} — "${post.text.slice(0, 100)}..."`);

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
