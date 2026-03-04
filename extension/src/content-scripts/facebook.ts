import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement, querySelectorFallback, querySelectorAllFallback } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "Facebook" as const;

// Selector fallback chains — self-healing against DOM changes
const SELECTORS = {
  feedContainer: '[role="feed"]',
  textContent: ['[dir="auto"]', '[data-ad-comet-preview]', ".userContent"],
  username: ['a[href*="/user/"]', 'a[href*="/profile"]', "h3 a", "h4 a"],
  postUrl: ['a[href*="/posts/"]', 'a[href*="/permalink/"]', 'a[href*="story_fbid"]'],
  engagement: ['[aria-label*="reaction"]', '[aria-label*="like"]'],
  groupHeader: ["h1", '[role="banner"] a'],
  timestamp: ["abbr", "[data-utime]", "time"],
};

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: SELECTORS.feedContainer,

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.getAttribute("role") === "article" ||
      node.querySelector('[role="article"]') !== null
    );
  },

  extractPost(element: HTMLElement): ExtractedPost | null {
    const article =
      element.getAttribute("role") === "article"
        ? element
        : element.querySelector('[role="article"]');
    if (!article || !(article instanceof HTMLElement)) return null;

    // Try to expand "See More" so we get full post text for keyword matching
    const seeMoreBtn = article.querySelector<HTMLElement>(
      '[role="button"][tabindex="0"]'
    );
    if (seeMoreBtn) {
      const btnText = (seeMoreBtn.textContent || "").toLowerCase().trim();
      if (btnText === "see more" || btnText === "see more…") {
        try {
          seeMoreBtn.click();
        } catch {
          // Non-critical — proceed with visible text
        }
      }
    }

    // Extract post text — fallback chain
    const textBlocks = querySelectorAllFallback(article, SELECTORS.textContent, PLATFORM, "textContent");
    const textParts: string[] = [];
    textBlocks.forEach((block) => {
      const text = getCleanText(block as HTMLElement);
      if (text.length > 10) textParts.push(text);
    });
    const text = textParts.join(" ").slice(0, 2000);
    if (!text) return null;

    // Extract username — fallback chain
    const profileLink = querySelectorFallback(article, SELECTORS.username, PLATFORM, "username");
    const username = profileLink ? getCleanText(profileLink) : "Unknown";

    // Extract post URL — fallback chain
    const timeLink = querySelectorFallback(article, SELECTORS.postUrl, PLATFORM, "postUrl");
    const url = timeLink ? (timeLink as HTMLAnchorElement).href : window.location.href;

    // Extract group name — fallback chain
    const groupHeader = querySelectorFallback(document, SELECTORS.groupHeader, PLATFORM, "groupHeader");
    const source = groupHeader ? getCleanText(groupHeader) : "Facebook Group";

    // Extract engagement — fallback chain
    const reactionSpans = querySelectorAllFallback(article, SELECTORS.engagement, PLATFORM, "engagement");
    let engagement = 0;
    reactionSpans.forEach((span) => {
      const label = span.getAttribute("aria-label") || "";
      const match = label.match(/(\d[\d,.]*[KkMm]?)/);
      if (match) engagement = Math.max(engagement, parseEngagement(match[1]));
    });

    // Timestamp — fallback chain
    const timeEl = querySelectorFallback(article, SELECTORS.timestamp, PLATFORM, "timestamp");
    const timestamp =
      timeEl?.getAttribute("title") ||
      timeEl?.getAttribute("datetime") ||
      new Date().toISOString();

    return { platform: PLATFORM, text, username, url, timestamp, engagement, source };
  },
};

async function init() {
  const { platformToggles } = await chrome.storage.local.get("platformToggles");
  if (platformToggles && platformToggles.Facebook === false) {
    console.log("[SignalDesk] Facebook monitoring disabled");
    return;
  }

  console.log("[SignalDesk] Facebook content script active");

  createPlatformObserver(adapter, (post) => {
    if (!passesPreFilter(post.text)) {
      console.log(`[SignalDesk] [Facebook] Post FILTERED OUT: "${post.text.slice(0, 80)}..."`);
      return;
    }

    chrome.runtime.sendMessage(
      { type: "POST_DETECTED", payload: post },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[SignalDesk] [Facebook] sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[SignalDesk] [Facebook] Background response:`, response);
        }
      }
    );
  });
}

init();

// Auto-scroll message listener — triggered by service worker during auto-monitor
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
