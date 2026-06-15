// ---------------------------------------------------------------------------
// Shared keyword lists — VA Hiring Detection Only
//
// high_intent / medium_intent: someone is looking to HIRE a VA (these are leads)
// negative:                    a VA is looking for WORK / self-promo (reject)
//
// SINGLE SOURCE OF TRUTH for default keywords. These mirror the Supabase
// `keywords` table exactly and serve as:
//   1. Seed data for a fresh/empty DB (see scripts/sync-keywords.mjs)
//   2. A fallback when the DB is empty or the backend is unreachable
//
// At RUNTIME the DB keywords (managed from the /settings page) take priority
// everywhere. Keep this file in sync with the DB via scripts/sync-keywords.mjs.
//
// IMPORTANT: Check negative (SEEKING) first — a post advertising VA services
// may also contain hiring words. Seeking takes priority to avoid false leads.
// ---------------------------------------------------------------------------

export type KeywordCategory = "high_intent" | "medium_intent" | "negative";

export interface CategorizedKeywords {
  high_intent: string[];
  medium_intent: string[];
  negative: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// CANONICAL DEFAULT KEYWORDS — kept in sync with the Supabase keywords table
// ═══════════════════════════════════════════════════════════════════════
export const DEFAULT_KEYWORDS: CategorizedKeywords = {
  // ───────────────────────────────────────────────────────────────────
  // HIGH INTENT — Direct hiring intent (+40, high-confidence leads)
  // ───────────────────────────────────────────────────────────────────
  high_intent: [
    "[for hire - va]",
    "[hiring]",
    "hire a va",
    "hire a virtual assistant",
    "hire va for business",
    "hiring a va",
    "hiring a virtual assistant",
    "hiring airbnb cleaner",
    "hiring amazon va",
    "hiring appointment setter",
    "hiring bookkeeping va",
    "hiring cold caller va",
    "hiring content writer remote",
    "hiring content writer va",
    "hiring ecommerce va",
    "hiring etsy va",
    "hiring executive assistant",
    "hiring executive assistant remote",
    "hiring filipino virtual assistant",
    "hiring full time va",
    "hiring fulltime va",
    "hiring ghl va",
    "hiring gohighlevel va",
    "hiring immediately va",
    "hiring lead generation va",
    "hiring leasing assistant",
    "hiring online assistant",
    "hiring part time va",
    "hiring podcast va",
    "hiring real estate va",
    "hiring real estate virtual assistant",
    "hiring real state va",
    "hiring remote assistant",
    "hiring remote chat support",
    "hiring remote sales",
    "hiring remote technician",
    "hiring shopify va",
    "hiring social media manager",
    "hiring social media va",
    "hiring va",
    "hiring video editing",
    "hiring video editing va",
    "hiring video editor",
    "hiring virtual assistant",
    "hiring virtual assistant immediately",
    "hiring visa appointment booking",
    "looking for a filipino va",
    "looking for a reliable virtual assistant",
    "looking for a remote assistant",
    "looking for a va",
    "looking for a virtual assistant",
    "looking for an online assistant",
    "looking for lead generation specialist",
    "looking for online assistant",
    "looking for someone to manage my social media",
    "looking for virtual assistant",
    "need a bookkeeping va",
    "need a remote worker",
    "need a va",
    "need a virtual assistant",
    "need a virtual assistant for",
    "need admin support",
    "need bookeeping va",
    "need help with amazon fba",
    "need help with inbox",
    "need someone for customer service",
    "need someone for data entry",
    "need someone to book appointments",
    "need someone to handle admin",
    "need someone to manage emails",
    "need someone to manage my crm",
    "need someone to run my ads",
    "need telecaller",
    "outsourcing admin work",
    "overwhelmed need help",
    "remote marketing lead",
    "remote virtual assistant needed",
    "searching for a va",
    "searching for a virtual assistant",
    "searching for va",
    "seeking scriptwriter",
    "seeking vas",
    "urgent va hire",
    "urgently looking for a virtual assistant",
    "va needed",
    "va needed urgently",
    "virtual assistant needed",
    "want to hire a va",
    "want to hire a virtual assistant",
    "want to hire virtual assistant",
    "we're looking for a virtual assistant who can start immediately",
  ],

  // ───────────────────────────────────────────────────────────────────
  // MEDIUM INTENT — Research, recommendation, overwhelm/delegation,
  // tool-specific signals (+20, person may be considering hiring)
  // ───────────────────────────────────────────────────────────────────
  medium_intent: [
    "any va recommendations",
    "best place to find a va",
    "best va service",
    "can anyone recommend a va",
    "can't keep up with emails",
    "considering a hiring va",
    "considering hiring a va",
    "drowning in tasks",
    "has anyone hired a va",
    "how much does a va cost",
    "how to find a good va",
    "is it worth hiring a va",
    "looking for virtual support",
    "need extra help in my business",
    "need help managing my calendar",
    "need remote help",
    "need someone to manage",
    "need support in my business",
    "need to delegate tasks",
    "need va for canva",
    "need va for click funnels",
    "need va for clickfunnels",
    "need va for gohighlevel",
    "need va for hubspot",
    "need va for mailchimp",
    "need va for quickbooks",
    "need va for salesforce",
    "need va for shopify",
    "need va for wordpress",
    "need va for zapier",
    "need va for zapper",
    "onlinejobs.ph",
    "overwhelmed with admin",
    "recommend a good va",
    "remote administrative support needed",
    "remote assistant wanted",
    "scaling my business and need help",
    "should i hire a va",
    "spending too much time on admin",
    "thinking of hiring a va",
    "tips for hiring a good va",
    "tips for hiring a va",
    "too many client messages",
    "va agency recommendation",
    "va agency recommendations",
    "va cost",
    "va pricing",
    "va rates",
    "virtual assistant agency",
    "virtual assistant rates",
    "virtual assistant services needed",
    "where to find a va",
    "where to hire a va",
    "who can recommend a virtual assistant",
  ],

  // ───────────────────────────────────────────────────────────────────
  // NEGATIVE — VA seeking work / self-promo / job-ad noise (-40, reject)
  // ───────────────────────────────────────────────────────────────────
  negative: [
    "13th month pay",
    "[for hire]",
    "accepting new clients",
    "apply now",
    "available for hire",
    "book a discovery call",
    "certified virtual assistant",
    "check out my portfolio",
    "dm for rates",
    "dm me",
    "dm me for",
    "dm me for rates",
    "experienced virtual assistant",
    "freelance va here",
    "hire me",
    "hmo coverage",
    "i am a va",
    "i am a virtual assistant",
    "i can be your va",
    "i offer virtual assistant",
    "i provide va services",
    "i specialize in",
    "i will be you virtual assistant",
    "i will be your virtual assistant",
    "i'm a va",
    "i'm a virtual assistant",
    "ignore other people comment",
    "looking for a va job",
    "looking for clients",
    "looking for va work",
    "looking for work",
    "my services include",
    "offering va services",
    "open for clients",
    "permanent work from home",
    "ph residents only",
    "services i offer",
    "share my resume",
    "training allowance",
    "va available",
    "what i can help you with",
    "why me",
    "years of experience as a va",
    "years of experience in",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// BACK-COMPAT DERIVED EXPORTS
// HIRING_KEYWORDS = all positive (high + medium) signals
// SEEKING_KEYWORDS = negative signals
// ═══════════════════════════════════════════════════════════════════════
export const HIRING_KEYWORDS: string[] = [
  ...DEFAULT_KEYWORDS.high_intent,
  ...DEFAULT_KEYWORDS.medium_intent,
];

export const SEEKING_KEYWORDS: string[] = DEFAULT_KEYWORDS.negative;

export type PostClassification = "HIRING_VA" | "SEEKING_WORK" | null;

/**
 * Classify text against the given hiring/seeking keyword lists.
 * Case-insensitive. Returns null if no match (IRRELEVANT).
 * Checks SEEKING first to avoid false positives from VAs advertising.
 *
 * Prefer this over classifyText() when you have DB keywords available —
 * pass the user-configured keywords from the Supabase `keywords` table so
 * detection stays in sync with the /settings page.
 */
export function classifyTextWithKeywords(
  text: string,
  hiringKeywords: string[],
  seekingKeywords: string[]
): PostClassification {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Check seeking FIRST — VA self-promo may contain hiring words
  for (const kw of seekingKeywords) {
    if (lower.includes(kw.toLowerCase())) return "SEEKING_WORK";
  }
  for (const kw of hiringKeywords) {
    if (lower.includes(kw.toLowerCase())) return "HIRING_VA";
  }
  return null;
}

/**
 * Classify text against the static default keyword lists.
 * Convenience wrapper used as a fallback when DB keywords are unavailable.
 */
export function classifyText(text: string): PostClassification {
  return classifyTextWithKeywords(text, HIRING_KEYWORDS, SEEKING_KEYWORDS);
}

/**
 * Match a post's text against a keyword list and return the matched keywords.
 *
 * Case-insensitive. Matches an exact substring OR, for multi-word keywords, when
 * ≥70% of the keyword's significant words (length > 2) appear anywhere in the
 * text. The fuzzy fallback catches real leads that use slightly different
 * wording — e.g. "Looking for VA" matches the keyword "looking for a va".
 *
 * IMPORTANT: This is the SHARED matcher. It must stay identical to the scraper's
 * copy in scraper-service/src/scrapers/urlScraper.ts (matchKeywords) so the
 * scraper and the backend agree on what counts as a keyword match. The two live
 * in separate packages and cannot import from each other.
 */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase().trim();
    if (!kwLower) continue;
    // Exact substring match
    if (lower.includes(kwLower)) {
      matched.push(kw.trim());
    } else {
      // Fuzzy fallback: ≥70% of significant words present anywhere
      const words = kwLower.split(/\s+/).filter((w) => w.length > 2);
      if (words.length >= 2) {
        const wordMatches = words.filter((w) => lower.includes(w));
        if (wordMatches.length >= Math.ceil(words.length * 0.7)) {
          matched.push(kw.trim());
        }
      }
    }
  }
  return matched;
}
