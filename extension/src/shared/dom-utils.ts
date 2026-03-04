/** Safely extract text content, stripping excess whitespace */
export function getCleanText(el: HTMLElement | null): string {
  if (!el) return "";
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Parse engagement count from text like "1.2K", "5", "432" */
export function parseEngagement(text: string): number {
  const clean = text.trim().toLowerCase();
  if (clean.includes("k")) return Math.round(parseFloat(clean) * 1000);
  if (clean.includes("m")) return Math.round(parseFloat(clean) * 1_000_000);
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------------------
// Self-healing selector fallback — tries each selector in order,
// logs when primary fails so we can detect platform DOM changes.
// ---------------------------------------------------------------------------

interface ParsingEvent {
  platform: string;
  field: string;
  primarySelector: string;
  fallbackUsed: string | null;
  fallbackIndex: number;
  timestamp: number;
  url: string;
}

/**
 * Query the DOM with a chain of selectors. Returns the first match.
 * Logs a parsing event if the primary selector fails.
 */
export function querySelectorFallback(
  root: HTMLElement | Document,
  selectors: string[],
  platform: string,
  field: string
): HTMLElement | null {
  for (let i = 0; i < selectors.length; i++) {
    const el = root.querySelector(selectors[i]) as HTMLElement | null;
    if (el) {
      if (i > 0) {
        logParsingEvent({
          platform,
          field,
          primarySelector: selectors[0],
          fallbackUsed: selectors[i],
          fallbackIndex: i,
          timestamp: Date.now(),
          url: window.location.href,
        });
      }
      return el;
    }
  }

  // All selectors failed
  logParsingEvent({
    platform,
    field,
    primarySelector: selectors[0],
    fallbackUsed: null,
    fallbackIndex: -1,
    timestamp: Date.now(),
    url: window.location.href,
  });

  return null;
}

/**
 * Query all matching elements using a chain of selectors.
 * Returns results from the first selector that has matches.
 */
export function querySelectorAllFallback(
  root: HTMLElement | Document,
  selectors: string[],
  platform: string,
  field: string
): NodeListOf<Element> | Element[] {
  for (let i = 0; i < selectors.length; i++) {
    const els = root.querySelectorAll(selectors[i]);
    if (els.length > 0) {
      if (i > 0) {
        logParsingEvent({
          platform,
          field,
          primarySelector: selectors[0],
          fallbackUsed: selectors[i],
          fallbackIndex: i,
          timestamp: Date.now(),
          url: window.location.href,
        });
      }
      return els;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Cross-platform "See More" expansion
// ---------------------------------------------------------------------------

interface SeeMoreConfig {
  buttonSelectors: string[];
  buttonTextPatterns: string[];
}

const SEE_MORE_CONFIGS: Record<string, SeeMoreConfig> = {
  Facebook: {
    buttonSelectors: [
      '[role="button"][tabindex="0"]',
      'div[dir="auto"] [role="button"]',
    ],
    buttonTextPatterns: ["see more", "see more\u2026"],
  },
  LinkedIn: {
    buttonSelectors: [
      ".see-more-less-button",
      'button[data-tracking-control-name*="see_more"]',
      ".feed-shared-inline-show-more-text button",
    ],
    buttonTextPatterns: ["see more", "\u2026see more", "...see more"],
  },
  X: {
    buttonSelectors: [
      '[data-testid="tweet-text-show-more-link"]',
    ],
    buttonTextPatterns: ["show more"],
  },
  Reddit: {
    buttonSelectors: [],
    buttonTextPatterns: [],
  },
};

/** Try to expand truncated post text by clicking "See More" / "Show More" buttons */
export function expandTruncatedText(container: HTMLElement, platform: string): void {
  const config = SEE_MORE_CONFIGS[platform];
  if (!config || config.buttonSelectors.length === 0) return;

  for (const selector of config.buttonSelectors) {
    const btn = container.querySelector<HTMLElement>(selector);
    if (!btn) continue;
    const btnText = (btn.textContent || "").toLowerCase().trim();
    if (config.buttonTextPatterns.some((p) => btnText.includes(p))) {
      try { btn.click(); } catch { /* non-critical */ }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Heuristic/structural extraction — last resort when ALL CSS selectors fail
// ---------------------------------------------------------------------------

const NOISE_ROLES = ["navigation", "complementary", "banner", "contentinfo"];

/**
 * Heuristic: find the most likely "post body" text block within a container.
 * Scores candidates by text length, text-to-HTML ratio, and position.
 */
export function heuristicFindTextBlock(container: HTMLElement): HTMLElement | null {
  let bestEl: HTMLElement | null = null;
  let bestScore = 0;

  const candidates = container.querySelectorAll("div, span, p");
  for (const candidate of candidates) {
    const el = candidate as HTMLElement;

    // Skip noise containers
    const role = el.getAttribute("role") || "";
    if (NOISE_ROLES.includes(role)) continue;
    if (el.closest('[role="navigation"], [role="complementary"], [role="banner"]')) continue;

    const text = (el.textContent || "").trim();
    if (text.length < 40) continue;

    const html = el.innerHTML || "";
    // Text-to-HTML ratio: high = real text, low = heavy markup/ads
    const ratio = html.length > 0 ? text.length / html.length : 0;
    if (ratio < 0.3) continue;

    // Score: text length (normalized) * ratio
    const score = Math.min(text.length, 500) * ratio;
    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  }

  if (bestEl) {
    logParsingEvent({
      platform: "unknown",
      field: "textContent",
      primarySelector: "heuristic",
      fallbackUsed: "heuristicFindTextBlock",
      fallbackIndex: -2,
      timestamp: Date.now(),
      url: window.location.href,
    });
  }

  return bestEl;
}

/** Platform-specific path patterns for identifying profile links */
const PROFILE_PATTERNS = ["/user/", "/profile", "/@", "/people/", "/in/"];

/**
 * Heuristic: find the author username by looking for profile-like links.
 */
export function heuristicFindUsername(container: HTMLElement): string {
  // Strategy 1: find <a> with profile-like href
  const links = container.querySelectorAll("a[href]");
  for (const link of links) {
    const href = (link as HTMLAnchorElement).href || "";
    if (PROFILE_PATTERNS.some((p) => href.includes(p))) {
      const text = (link.textContent || "").trim();
      if (text.length > 0 && text.length < 60) return text;
    }
  }

  // Strategy 2: first bold/strong text (author names are often bold)
  const bold = container.querySelector("strong, b, [style*='font-weight']");
  if (bold) {
    const text = (bold.textContent || "").trim();
    if (text.length > 0 && text.length < 60) return text;
  }

  return "";
}

/**
 * Heuristic: find engagement count by looking for aria-labels with numbers
 * or small numeric text near action buttons.
 */
export function heuristicFindEngagement(container: HTMLElement): number {
  let maxEngagement = 0;

  // Strategy 1: aria-label with numbers
  const labeled = container.querySelectorAll("[aria-label]");
  for (const el of labeled) {
    const label = el.getAttribute("aria-label") || "";
    const match = label.match(/(\d[\d,.]*[KkMm]?)/);
    if (match) {
      maxEngagement = Math.max(maxEngagement, parseEngagement(match[1]));
    }
  }

  // Strategy 2: small numeric text near role="button" or role="group"
  if (maxEngagement === 0) {
    const groups = container.querySelectorAll('[role="group"], [role="button"]');
    for (const group of groups) {
      const spans = group.querySelectorAll("span");
      for (const span of spans) {
        const text = (span.textContent || "").trim();
        if (/^\d[\d,.]*[KkMm]?$/.test(text)) {
          maxEngagement = Math.max(maxEngagement, parseEngagement(text));
        }
      }
    }
  }

  return maxEngagement;
}

/** Platform-specific post URL path patterns */
const POST_URL_PATTERNS = [
  "/posts/", "/status/", "/comments/", "/permalink/",
  "story_fbid", "pfbid", "/feed/update/",
];

/**
 * Heuristic: find a post URL by looking for links with post-specific path patterns.
 */
export function heuristicFindPostUrl(container: HTMLElement): string {
  const links = container.querySelectorAll("a[href]");
  for (const link of links) {
    const href = (link as HTMLAnchorElement).href || "";
    if (POST_URL_PATTERNS.some((p) => href.includes(p))) {
      return href;
    }
  }

  // Fallback: timestamp link (all platforms tend to link timestamps to the post)
  const timeLink = container.querySelector("a time, a [datetime]");
  if (timeLink) {
    const anchor = timeLink.closest("a") as HTMLAnchorElement | null;
    if (anchor?.href) return anchor.href;
  }

  return "";
}

// Buffer parsing events and send to service worker in batches
let parsingEventBuffer: ParsingEvent[] = [];
let parsingEventTimer: ReturnType<typeof setTimeout> | null = null;

function logParsingEvent(event: ParsingEvent): void {
  if (event.fallbackIndex === -1) {
    console.warn(
      `[SignalDesk] [${event.platform}] All selectors failed for "${event.field}" — ` +
      `primary: "${event.primarySelector}"`
    );
  } else {
    console.info(
      `[SignalDesk] [${event.platform}] Fallback used for "${event.field}" — ` +
      `primary "${event.primarySelector}" failed, using "${event.fallbackUsed}" (index ${event.fallbackIndex})`
    );
  }

  parsingEventBuffer.push(event);

  // Batch send every 30 seconds
  if (!parsingEventTimer) {
    parsingEventTimer = setTimeout(() => {
      if (parsingEventBuffer.length > 0) {
        try {
          chrome.runtime.sendMessage({
            type: "PARSING_EVENTS",
            events: parsingEventBuffer,
          });
        } catch {
          // Service worker may not be listening — that's OK
        }
        parsingEventBuffer = [];
      }
      parsingEventTimer = null;
    }, 30_000);
  }
}
