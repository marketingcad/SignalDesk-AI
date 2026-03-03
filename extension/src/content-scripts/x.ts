import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement } from "../shared/dom-utils";
import type { ExtractedPost } from "../types";

const PLATFORM = "X" as const;

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector:
    '[data-testid="primaryColumn"] section, [aria-label*="Timeline"]',

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.matches('article[data-testid="tweet"]') ||
      node.querySelector('article[data-testid="tweet"]') !== null
    );
  },

  extractPost(element: HTMLElement): ExtractedPost | null {
    const article =
      element.matches('article[data-testid="tweet"]')
        ? element
        : element.querySelector('article[data-testid="tweet"]');
    if (!article || !(article instanceof HTMLElement)) return null;

    // Extract tweet text
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = getCleanText(textEl as HTMLElement).slice(0, 2000);
    if (!text) return null;

    // Username
    const userEl = article.querySelector('[data-testid="User-Name"]');
    const username = userEl
      ? getCleanText(userEl as HTMLElement).split("@")[0].trim()
      : "Unknown";

    // Tweet URL — look for the timestamp link
    const timeLink = article.querySelector('a[href*="/status/"] time');
    const tweetLink = timeLink?.closest("a") as HTMLAnchorElement | null;
    const url = tweetLink ? tweetLink.href : window.location.href;

    // Engagement — likes
    const likeEl = article.querySelector(
      '[data-testid="like"] span, [data-testid="unlike"] span'
    );
    const retweetEl = article.querySelector(
      '[data-testid="retweet"] span, [data-testid="unretweet"] span'
    );
    const likes = likeEl ? parseEngagement(getCleanText(likeEl as HTMLElement)) : 0;
    const retweets = retweetEl ? parseEngagement(getCleanText(retweetEl as HTMLElement)) : 0;
    const engagement = likes + retweets;

    // Timestamp
    const timeEl = article.querySelector("time");
    const timestamp =
      timeEl?.getAttribute("datetime") || new Date().toISOString();

    const source = "X Feed";

    return { platform: PLATFORM, text, username, url, timestamp, engagement, source };
  },
};

async function init() {
  const { platformToggles } = await chrome.storage.local.get("platformToggles");
  if (platformToggles && platformToggles.X === false) {
    console.log("[SignalDesk] X monitoring disabled");
    return;
  }

  console.log("[SignalDesk] X content script active");

  createPlatformObserver(adapter, (post) => {
    if (!passesPreFilter(post.text)) {
      console.log(`[SignalDesk] [X] Post FILTERED OUT: "${post.text.slice(0, 80)}..."`);
      return;
    }

    console.log(`[SignalDesk] [X] Sending to background: ${post.username} — "${post.text.slice(0, 100)}..."`);

    chrome.runtime.sendMessage(
      { type: "POST_DETECTED", payload: post },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[SignalDesk] [X] sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[SignalDesk] [X] Background response:`, response);
        }
      }
    );
  });
}

init();
