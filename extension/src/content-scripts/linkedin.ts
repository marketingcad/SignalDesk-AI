import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement, querySelectorFallback, expandTruncatedText, heuristicFindTextBlock, heuristicFindUsername, heuristicFindEngagement, heuristicFindPostUrl } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "LinkedIn" as const;

// Selector fallback chains — self-healing against DOM changes
const SELECTORS = {
  feedContainer: '[role="main"]',
  textContent: [
    ".feed-shared-text",
    ".break-words",
    "[dir='ltr']",
    ".feed-shared-update-v2__description span[dir]",  // deeper structural
    ".update-components-text span",                    // newer LI components
  ],
  username: [
    ".feed-shared-actor__name",
    ".update-components-actor__name",
    'a[data-tracking-control-name*="actor"]',          // tracking attrs are stable
    ".feed-shared-actor a span[dir='ltr']",            // structural
  ],
  engagement: [
    ".social-details-social-counts__reactions-count",
    'button[aria-label*="reaction"] span',             // reaction button
    ".social-details-social-counts button span",       // generic count
  ],
  timestamp: [
    "time[datetime]",
    '.feed-shared-actor__sub-description span[aria-hidden="true"]',
  ],
};

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: SELECTORS.feedContainer,

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.classList.contains("feed-shared-update-v2") ||
      node.hasAttribute("data-urn") ||
      node.hasAttribute("data-id") ||
      node.querySelector(".feed-shared-update-v2") !== null ||
      node.querySelector("[data-urn]") !== null
    );
  },

  extractPost(element: HTMLElement): ExtractedPost | null {
    const post =
      element.classList.contains("feed-shared-update-v2")
        ? element
        : element.querySelector(".feed-shared-update-v2");
    if (!post || !(post instanceof HTMLElement)) return null;

    // Try to expand "See More" so we get full post text for keyword matching
    expandTruncatedText(post, PLATFORM);

    // Extract text — fallback chain + heuristic
    const textEl = querySelectorFallback(post, SELECTORS.textContent, PLATFORM, "textContent");
    let text = getCleanText(textEl).slice(0, 2000);
    if (!text) {
      const heuristicEl = heuristicFindTextBlock(post);
      text = getCleanText(heuristicEl).slice(0, 2000);
    }
    if (!text) return null;

    // Username — fallback chain + heuristic
    const nameEl = querySelectorFallback(post, SELECTORS.username, PLATFORM, "username");
    const username = getCleanText(nameEl) || heuristicFindUsername(post) || "Unknown";

    // Post URL + heuristic fallback
    const urnAttr = post.getAttribute("data-urn") || "";
    const activityId = urnAttr.split(":").pop() || "";
    let url = activityId
      ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`
      : "";
    if (!url || url === window.location.href) {
      url = heuristicFindPostUrl(post) || window.location.href;
    }

    // Engagement — fallback chain + heuristic
    const reactionEl = querySelectorFallback(post, SELECTORS.engagement, PLATFORM, "engagement");
    let engagement = reactionEl
      ? parseEngagement(getCleanText(reactionEl))
      : 0;
    if (engagement === 0) {
      engagement = heuristicFindEngagement(post);
    }

    // Timestamp — fallback chain
    const timeEl = querySelectorFallback(post, SELECTORS.timestamp, PLATFORM, "timestamp");
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
