import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement, querySelectorFallback, querySelectorAllFallback, expandTruncatedText, heuristicFindTextBlock, heuristicFindUsername, heuristicFindEngagement, heuristicFindPostUrl } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "Facebook" as const;

// Selector fallback chains — self-healing against DOM changes
const SELECTORS = {
  feedContainer: '[role="feed"]',
  textContent: ['[dir="auto"]', '[data-ad-comet-preview]', ".userContent"],
  username: ['a[href*="/user/"]', 'a[href*="/profile"]', "h3 a", "h4 a"],
  postUrl: [
    'a[href*="/posts/"]',
    'a[href*="/permalink/"]',
    'a[href*="story_fbid"]',
    'a[href*="?__cft__"]',                    // FB group post timestamp links
    'a[href*="/groups/"][href*="/posts/"]',    // explicit group post links
  ],
  engagement: ['[aria-label*="reaction"]', '[aria-label*="like"]'],
  groupHeader: ["h1", '[role="banner"] a'],
  timestamp: [
    "abbr",
    "[data-utime]",
    "time",
    'a[href*="?__cft__"]',                    // FB uses timestamp links with tooltip
    'span[id^="jsc_"]',                       // Facebook generated timestamp spans
  ],
};

/**
 * Filter [dir="auto"] text blocks to exclude comments, sidebar, and UI noise.
 * Facebook's [dir="auto"] matches everything — this keeps only actual post body text.
 */
function sanitizeTextBlocks(article: HTMLElement, blocks: Element[]): string[] {
  const seen = new Set<string>();
  const validTexts: string[] = [];

  for (const block of blocks) {
    const text = getCleanText(block as HTMLElement);
    if (text.length <= 10) continue;

    // Skip if inside a nested [role="article"] (= comment, not the post itself)
    let parent = block.parentElement;
    let nestedArticle = false;
    while (parent && parent !== article) {
      if (parent.getAttribute("role") === "article") {
        nestedArticle = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (nestedArticle) continue;

    // Skip if inside navigation, sidebar, or banner
    if (block.closest('[role="navigation"], [role="complementary"], [role="banner"]')) continue;

    // Skip short UI text near buttons/toolbars
    if (text.length < 30 && block.closest('[role="button"], [role="toolbar"]')) continue;

    // Skip blocks nested too deeply from article (sidebar/widget content)
    let depth = 0;
    let el: Element | null = block;
    while (el && el !== article) {
      depth++;
      el = el.parentElement;
    }
    if (depth > 15) continue;

    // Deduplicate (FB A/B testing sometimes renders text twice)
    if (seen.has(text)) continue;
    seen.add(text);

    validTexts.push(text);
  }

  return validTexts;
}

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
    expandTruncatedText(article, PLATFORM);

    // Extract post text — fallback chain + noise sanitization + heuristic
    const textBlocks = querySelectorAllFallback(article, SELECTORS.textContent, PLATFORM, "textContent");
    let textParts = sanitizeTextBlocks(article, Array.from(textBlocks));
    if (textParts.length === 0) {
      // Heuristic fallback: find the largest text block structurally
      const heuristicEl = heuristicFindTextBlock(article);
      if (heuristicEl) textParts = [getCleanText(heuristicEl)];
    }
    const text = textParts.join(" ").slice(0, 2000);
    if (!text) return null;

    // Extract username — fallback chain + heuristic
    const profileLink = querySelectorFallback(article, SELECTORS.username, PLATFORM, "username");
    const username = profileLink
      ? getCleanText(profileLink)
      : (heuristicFindUsername(article) || "Unknown");

    // Extract post URL — fallback chain
    let url = "";
    const postLink = querySelectorFallback(article, SELECTORS.postUrl, PLATFORM, "postUrl");
    if (postLink) {
      url = (postLink as HTMLAnchorElement).href;
    }

    // If no specific post link found, try any link with a unique post identifier
    if (!url || url === window.location.href) {
      const anyPostLink = article.querySelector(
        'a[href*="/posts/"], a[href*="/permalink/"], a[href*="pfbid"], a[href*="story_fbid"], a[href*="?__cft__"]'
      ) as HTMLAnchorElement | null;
      if (anyPostLink) url = anyPostLink.href;
    }

    // Heuristic fallback for URL
    if (!url || url === window.location.href) {
      url = heuristicFindPostUrl(article) || window.location.href;
    }

    // Extract group name — fallback chain
    const groupHeader = querySelectorFallback(document, SELECTORS.groupHeader, PLATFORM, "groupHeader");
    const source = groupHeader ? getCleanText(groupHeader) : "Facebook Group";

    // Extract engagement — fallback chain + heuristic
    const reactionSpans = querySelectorAllFallback(article, SELECTORS.engagement, PLATFORM, "engagement");
    let engagement = 0;
    reactionSpans.forEach((span) => {
      const label = span.getAttribute("aria-label") || "";
      const match = label.match(/(\d[\d,.]*[KkMm]?)/);
      if (match) engagement = Math.max(engagement, parseEngagement(match[1]));
    });
    if (engagement === 0) {
      engagement = heuristicFindEngagement(article);
    }

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
