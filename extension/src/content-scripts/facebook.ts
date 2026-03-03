import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "Facebook" as const;

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: '[role="feed"]',

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

    // Extract post text from dir="auto" blocks
    const textBlocks = article.querySelectorAll('[dir="auto"]');
    const textParts: string[] = [];
    textBlocks.forEach((block) => {
      const text = getCleanText(block as HTMLElement);
      if (text.length > 10) textParts.push(text);
    });
    const text = textParts.join(" ").slice(0, 2000);
    if (!text) return null;

    // Extract username from profile link
    const profileLink = article.querySelector(
      'a[href*="/user/"], a[href*="/profile"], h3 a, h4 a'
    );
    const username = profileLink
      ? getCleanText(profileLink as HTMLElement)
      : "Unknown";

    // Extract post URL
    const timeLink = article.querySelector(
      'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]'
    );
    const url = timeLink
      ? (timeLink as HTMLAnchorElement).href
      : window.location.href;

    // Extract group name
    const groupHeader =
      document.querySelector("h1") ||
      document.querySelector('[role="banner"] a');
    const source = groupHeader
      ? getCleanText(groupHeader as HTMLElement)
      : "Facebook Group";

    // Extract engagement
    const reactionSpans = article.querySelectorAll(
      '[aria-label*="reaction"], [aria-label*="like"]'
    );
    let engagement = 0;
    reactionSpans.forEach((span) => {
      const label = span.getAttribute("aria-label") || "";
      const match = label.match(/(\d[\d,.]*[KkMm]?)/);
      if (match) engagement = Math.max(engagement, parseEngagement(match[1]));
    });

    // Timestamp
    const timeEl = article.querySelector("abbr, [data-utime], time");
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
      console.log(`[SignalDesk] [Facebook] Post FILTERED OUT (no keyword match): "${post.text.slice(0, 80)}..."`);
      return;
    }

    console.log(
      `[SignalDesk] [Facebook] Sending to background:`,
      `\n  User: ${post.username}`,
      `\n  Text: ${post.text.slice(0, 100)}...`,
      `\n  Source: ${post.source}`
    );

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
