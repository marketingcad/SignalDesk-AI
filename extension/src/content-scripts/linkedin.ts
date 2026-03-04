import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement, querySelectorFallback } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "LinkedIn" as const;

// Selector fallback chains — self-healing against DOM changes
const SELECTORS = {
  feedContainer: '[role="main"]',
  textContent: [".feed-shared-text", ".break-words", "[dir='ltr']"],
  username: [".feed-shared-actor__name", ".update-components-actor__name"],
  engagement: [".social-details-social-counts__reactions-count"],
};

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: SELECTORS.feedContainer,

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.classList.contains("feed-shared-update-v2") ||
      node.hasAttribute("data-urn") ||
      node.querySelector(".feed-shared-update-v2") !== null
    );
  },

  extractPost(element: HTMLElement): ExtractedPost | null {
    const post =
      element.classList.contains("feed-shared-update-v2")
        ? element
        : element.querySelector(".feed-shared-update-v2");
    if (!post || !(post instanceof HTMLElement)) return null;

    // Extract text — fallback chain
    const textEl = querySelectorFallback(post, SELECTORS.textContent, PLATFORM, "textContent");
    const text = getCleanText(textEl).slice(0, 2000);
    if (!text) return null;

    // Username — fallback chain
    const nameEl = querySelectorFallback(post, SELECTORS.username, PLATFORM, "username");
    const username = getCleanText(nameEl) || "Unknown";

    // Post URL
    const urnAttr = post.getAttribute("data-urn") || "";
    const activityId = urnAttr.split(":").pop() || "";
    const url = activityId
      ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`
      : window.location.href;

    // Engagement — fallback chain
    const reactionEl = querySelectorFallback(post, SELECTORS.engagement, PLATFORM, "engagement");
    const engagement = reactionEl
      ? parseEngagement(getCleanText(reactionEl))
      : 0;

    // Timestamp
    const timeEl = post.querySelector("time");
    const timestamp =
      timeEl?.getAttribute("datetime") || new Date().toISOString();

    const source = "LinkedIn Feed";

    return { platform: PLATFORM, text, username, url, timestamp, engagement, source };
  },
};

async function init() {
  const { platformToggles } = await chrome.storage.local.get("platformToggles");
  if (platformToggles && platformToggles.LinkedIn === false) {
    console.log("[SignalDesk] LinkedIn monitoring disabled");
    return;
  }

  console.log("[SignalDesk] LinkedIn content script active");

  createPlatformObserver(adapter, (post) => {
    if (!passesPreFilter(post.text)) {
      console.log(`[SignalDesk] [LinkedIn] Post FILTERED OUT: "${post.text.slice(0, 80)}..."`);
      return;
    }

    chrome.runtime.sendMessage(
      { type: "POST_DETECTED", payload: post },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[SignalDesk] [LinkedIn] sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[SignalDesk] [LinkedIn] Background response:`, response);
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
