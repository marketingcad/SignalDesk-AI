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
