/**
 * Lightweight client-side keyword check + scoring gate.
 * Prevents sending irrelevant posts to the backend API.
 * The backend does the full weighted scoring — this is a quick gate.
 *
 * Includes:
 * - Immediate rejection for self-promotion / job-seeker posts
 * - Lightweight client-side scoring with a minimum threshold
 * - Configurable via /api/config endpoint (future)
 */

// ---------------------------------------------------------------------------
// Reject terms — posts matching these are dropped immediately
// ---------------------------------------------------------------------------

const REJECT_TERMS = [
  "i'm a virtual assistant",
  "i am a virtual assistant",
  "offering va services",
  "i provide va services",
  "looking for va work",
  "looking for a va job",
  "freelance va here",
];

// ---------------------------------------------------------------------------
// Client-side scoring keywords (subset of backend, synced via config)
// ---------------------------------------------------------------------------

interface ScoringKeyword {
  term: string;
  weight: number;
}

const CLIENT_KEYWORDS: ScoringKeyword[] = [
  // High signal (+40)
  { term: "hiring virtual assistant", weight: 40 },
  { term: "need a va", weight: 40 },
  { term: "looking for a va", weight: 40 },
  { term: "want to hire a va", weight: 40 },
  { term: "virtual assistant needed", weight: 40 },
  { term: "hiring va", weight: 40 },
  { term: "need a virtual assistant", weight: 40 },
  { term: "looking for a virtual assistant", weight: 40 },
  { term: "searching for a va", weight: 40 },
  { term: "hiring remote assistant", weight: 40 },
  { term: "need admin support", weight: 40 },
  { term: "hire a va", weight: 40 },
  { term: "looking to hire", weight: 30 },
  { term: "want to hire", weight: 30 },
  { term: "need someone to manage", weight: 30 },
  { term: "urgent va hire", weight: 30 },
  { term: "hiring immediately", weight: 30 },
  { term: "hiring asap", weight: 30 },

  // Medium signal (+20)
  { term: "va recommendations", weight: 20 },
  { term: "recommend a virtual", weight: 20 },
  { term: "best va service", weight: 20 },
  { term: "where to find a va", weight: 20 },
  { term: "thinking of hiring", weight: 20 },
  { term: "va cost", weight: 20 },
  { term: "va pricing", weight: 20 },
  { term: "va rates", weight: 20 },

  // Delegation signal (+15)
  { term: "overwhelmed", weight: 15 },
  { term: "drowning in tasks", weight: 15 },
  { term: "scaling my business", weight: 15 },
  { term: "need extra help", weight: 15 },
  { term: "delegate", weight: 15 },
  { term: "admin work", weight: 15 },

  // Tool-specific (+15)
  { term: "gohighlevel", weight: 15 },
  { term: "ghl", weight: 15 },
  { term: "zapier", weight: 15 },
  { term: "clickfunnels", weight: 15 },
  { term: "hubspot", weight: 15 },
  { term: "salesforce", weight: 15 },
  { term: "crm setup", weight: 15 },
  { term: "automation setup", weight: 15 },
  { term: "funnel building", weight: 15 },
  { term: "lead management", weight: 15 },
  { term: "email marketing", weight: 15 },
  { term: "social media management", weight: 15 },
  { term: "bookkeeping", weight: 15 },
  { term: "quickbooks", weight: 15 },
  { term: "data entry", weight: 15 },
  { term: "customer support", weight: 15 },

  // Urgency (+10)
  { term: "asap", weight: 10 },
  { term: "urgently", weight: 10 },
  { term: "immediately", weight: 10 },
];

/**
 * Regex to match "VA" as a standalone word — handles punctuation, line breaks,
 * and sentence boundaries that the simple substring check misses.
 */
const VA_WORD_REGEX = /\bva\b/;

/** Minimum quick score to pass filter. Posts below this are dropped. */
const MIN_QUICK_SCORE = 15;

/** Minimum text length to process. */
const MIN_TEXT_LENGTH = 20;

// ---------------------------------------------------------------------------
// Result interface
// ---------------------------------------------------------------------------

export interface PreFilterResult {
  pass: boolean;
  quickScore: number;
  matchedTerms: string[];
  rejected: boolean;
}

// ---------------------------------------------------------------------------
// Main filter function
// ---------------------------------------------------------------------------

export function preFilter(text: string): PreFilterResult {
  if (!text || text.length < MIN_TEXT_LENGTH) {
    return { pass: false, quickScore: 0, matchedTerms: [], rejected: false };
  }

  const lower = text.toLowerCase();

  // Immediate rejection for self-promotion / job-seeker posts
  for (const term of REJECT_TERMS) {
    if (lower.includes(term)) {
      console.log(`[SignalDesk] Pre-filter REJECTED — matched: "${term}"`);
      return { pass: false, quickScore: 0, matchedTerms: [term], rejected: true };
    }
  }

  // Weighted scoring
  let score = 0;
  const matchedTerms: string[] = [];

  for (const { term, weight } of CLIENT_KEYWORDS) {
    if (lower.includes(term)) {
      score += weight;
      matchedTerms.push(term);
    }
  }

  // Bonus for standalone "VA" mention
  if (VA_WORD_REGEX.test(lower)) {
    score += 10;
  }

  const pass = score >= MIN_QUICK_SCORE;

  if (pass) {
    console.log(
      `[SignalDesk] Pre-filter PASSED — quickScore: ${score}, matched: [${matchedTerms.join(", ")}]`
    );
  }

  return { pass, quickScore: Math.min(score, 100), matchedTerms, rejected: false };
}

/**
 * Backwards-compatible wrapper — returns boolean like the old API.
 * Existing content scripts that import `passesPreFilter` continue to work.
 */
export function passesPreFilter(text: string): boolean {
  return preFilter(text).pass;
}
