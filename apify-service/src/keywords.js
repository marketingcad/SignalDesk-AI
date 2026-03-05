/**
 * Keyword-based pre-filter for Apify results.
 * Filters out irrelevant posts before sending to the backend,
 * saving API calls and processing time.
 */

// ---------------------------------------------------------------------------
// Reject terms — posts matching these are self-promotion, not hiring
// ---------------------------------------------------------------------------

const REJECT_TERMS = [
  "i'm a virtual assistant",
  "i am a virtual assistant",
  "offering va services",
  "i provide va services",
  "looking for va work",
  "looking for a va job",
  "freelance va here",
  "hire me",
  "va available",
  "available for hire",
  "open for clients",
  "looking for work",
];

// ---------------------------------------------------------------------------
// Primary Keywords — High Intent (+40)
// ---------------------------------------------------------------------------

const HIGH_INTENT = [
  "looking for a virtual assistant",
  "hiring a virtual assistant",
  "need a va",
  "need a virtual assistant",
  "want to hire a va",
  "searching for a va",
  "hiring remote assistant",
  "need admin support",
  "hiring executive assistant remote",
  "hiring ghl va",
  "hiring gohighlevel va",
  "hiring social media va",
  "hiring real estate va",
  "hiring cold caller va",
  "hiring appointment setter",
  "need someone to manage my crm",
  "need someone to handle admin",
  "need help with inbox",
  "need someone to manage emails",
  "need someone to book appointments",
  "hiring immediately va",
  "urgent va hire",
  "outsourcing admin work",
  "hiring va",
  "virtual assistant needed",
  "looking for va",
  "hire a va",
  "looking to hire",
  "want to hire",
  "need someone to manage",
  "hiring immediately",
  "hiring asap",
];

// ---------------------------------------------------------------------------
// Secondary Keywords — Medium Intent (+20)
// ---------------------------------------------------------------------------

const MEDIUM_INTENT = [
  "any va recommendations",
  "who can recommend a virtual assistant",
  "best va service",
  "how much does a va cost",
  "virtual assistant rates",
  "va pricing",
  "where to find a va",
  "is it worth hiring a va",
  "thinking of hiring a va",
  "va recommendations",
  "recommend a virtual",
  "va cost",
  "va rates",
];

// ---------------------------------------------------------------------------
// Delegation Signals (+15)
// ---------------------------------------------------------------------------

const DELEGATION_SIGNALS = [
  "need extra help in my business",
  "overwhelmed with admin",
  "overwhelmed",
  "drowning in tasks",
  "too many client messages",
  "need support in my business",
  "scaling my business and need help",
  "scaling my business",
  "need extra help",
  "delegate",
  "admin work",
];

// ---------------------------------------------------------------------------
// Tool / Skill-Based Triggers (+15)
// Increase intent score when paired with hiring language
// ---------------------------------------------------------------------------

const TOOL_TRIGGERS = [
  "gohighlevel",
  "ghl",
  "clickfunnels",
  "hubspot",
  "salesforce",
  "zapier",
  "crm setup",
  "automation setup",
  "funnel building",
  "lead management",
  "appointment booking",
  "email marketing",
  "social media management",
  "facebook ads support",
  "tiktok management",
  "bookkeeping",
  "quickbooks",
  "data entry",
  "customer support",
];

// ---------------------------------------------------------------------------
// Urgency Boosters (+10)
// ---------------------------------------------------------------------------

const URGENCY = [
  "asap",
  "urgently",
  "immediately",
];

const VA_WORD_REGEX = /\bva\b/i;
const MIN_SCORE = 15;

// ---------------------------------------------------------------------------
// Pre-filter function
// ---------------------------------------------------------------------------

/**
 * Score and filter a post's text for VA hiring intent.
 * @param {string} text - Post text content
 * @returns {{ pass: boolean, score: number, matchedTerms: string[], rejected: boolean }}
 */
export function preFilterPost(text) {
  if (!text || text.length < 20) {
    return { pass: false, score: 0, matchedTerms: [], rejected: false };
  }

  const lower = text.toLowerCase();

  // Reject self-promotion
  for (const term of REJECT_TERMS) {
    if (lower.includes(term)) {
      return { pass: false, score: 0, matchedTerms: [term], rejected: true };
    }
  }

  let score = 0;
  const matchedTerms = [];

  // High intent (+40)
  for (const term of HIGH_INTENT) {
    if (lower.includes(term)) {
      score += 40;
      matchedTerms.push(term);
    }
  }

  // Medium intent (+20)
  for (const term of MEDIUM_INTENT) {
    if (lower.includes(term)) {
      score += 20;
      matchedTerms.push(term);
    }
  }

  // Delegation signals (+15)
  for (const term of DELEGATION_SIGNALS) {
    if (lower.includes(term)) {
      score += 15;
      matchedTerms.push(term);
    }
  }

  // Tool triggers (+15)
  for (const term of TOOL_TRIGGERS) {
    if (lower.includes(term)) {
      score += 15;
      matchedTerms.push(term);
    }
  }

  // Urgency (+10)
  for (const term of URGENCY) {
    if (lower.includes(term)) {
      score += 10;
      matchedTerms.push(term);
    }
  }

  // Standalone "VA" mention (+10)
  if (VA_WORD_REGEX.test(text)) {
    score += 10;
  }

  const capped = Math.min(score, 100);
  const pass = capped >= MIN_SCORE;

  return { pass, score: capped, matchedTerms, rejected: false };
}
