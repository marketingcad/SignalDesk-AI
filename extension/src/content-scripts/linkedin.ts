import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement } from "../shared/dom-utils";
import type { ExtractedPost } from "../types";

const PLATFORM = "LinkedIn" as const;

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: '[role="main"]',

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

    // Extract text
    const textEl = post.querySelector(
      ".feed-shared-text, .break-words, [dir='ltr']"
    );
    const text = getCleanText(textEl as HTMLElement).slice(0, 2000);
    if (!text) return null;

    // Username
    const nameEl = post.querySelector(
      ".feed-shared-actor__name, .update-components-actor__name"
    );
    const username = getCleanText(nameEl as HTMLElement) || "Unknown";

    // Post URL
    const urnAttr = post.getAttribute("data-urn") || "";
    const activityId = urnAttr.split(":").pop() || "";
    const url = activityId
      ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`
      : window.location.href;

    // Engagement
    const reactionEl = post.querySelector(
      ".social-details-social-counts__reactions-count"
    );
    const engagement = reactionEl
      ? parseEngagement(getCleanText(reactionEl as HTMLElement))
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

    console.log(`[SignalDesk] [LinkedIn] Sending to background: ${post.username} — "${post.text.slice(0, 100)}..."`);

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
