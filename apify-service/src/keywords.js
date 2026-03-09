/**
 * Keyword-based pre-filter for Apify results.
 *
 * OBJECTIVE: Only pass posts where someone is HIRING or LOOKING TO HIRE
 * a Virtual Assistant. Reject all self-promotion, job-seeking, and
 * irrelevant posts to ensure only qualified VA hiring leads reach the DB.
 */

// ---------------------------------------------------------------------------
// REJECT — Self-promotion, job seekers, VAs advertising themselves
// Any match = immediate rejection, never saved to DB
// ---------------------------------------------------------------------------

const REJECT_TERMS = [
  // Self-identification as a VA
  "i'm a virtual assistant",
  "i am a virtual assistant",
  "i'm a va",
  "i am a va",
  "i'm a remote assistant",
  "i am a remote assistant",
  "i'm an executive assistant",
  "i am an executive assistant",
  "i'm a professional virtual",
  "i am a professional virtual",
  "i'm an experienced virtual",
  "i am an experienced virtual",

  // Offering services
  "offering va services",
  "offering my services",
  "i provide va services",
  "i offer va services",
  "i offer virtual assistant",
  "i can be your va",
  "i can be your virtual assistant",
  "i will be your va",
  "i will be your virtual assistant",
  "i will be your professional",
  "i will be your trustworthy",
  "i will be your reliable",
  "i will be your dedicated",

  // Seeking work
  "looking for va work",
  "looking for a va job",
  "looking for a va position",
  "looking for va clients",
  "looking for clients",
  "looking for a side gig",
  "looking for work",
  "looking for new clients",
  "looking for opportunities",
  "freelance va here",
  "va for hire",
  "va available for",
  "available for hire",
  "available for work",
  "open for clients",
  "open for work",
  "open for new clients",
  "open to new clients",
  "accepting new clients",
  "taking on new clients",
  "currently accepting",

  // Self-promotion markers
  "hire me",
  "va available",
  "dm me for",
  "dm for rates",
  "reach out to me",
  "contact me for",
  "book a call with me",
  "check out my services",
  "my va services",
  "my services include",
  "services i offer",
  "what i offer",
  "i can help you with",
  "i can help streamline",
  "i can assist you",
  "i specialize in",
  "my expertise",
  "my experience includes",

  // Reddit [For Hire] tag (VAs advertising)
  "[for hire]",
  "[for hire]:",
  "for hire -",
  "for hire:",

  // Rate advertising
  "$5/hour",
  "$5/hr",
  "$5 per hour",
  "$4/hour",
  "$4/hr",
  "$3/hour",
  "$3/hr",
  "usd/hour",
  "per hour rate",
  "hourly rate is",
  "my rate is",
  "starting at $",
];

// ---------------------------------------------------------------------------
// HIGH INTENT (+40) — Direct hiring signals
// Person is actively looking to HIRE a VA
// ---------------------------------------------------------------------------

const HIGH_INTENT = [
  // Explicit VA hiring
  "looking for a virtual assistant",
  "looking for a va",
  "hiring a virtual assistant",
  "hiring a va",
  "hiring va",
  "hire a va",
  "hire a virtual assistant",
  "need a va",
  "need a virtual assistant",
  "want to hire a va",
  "want to hire a virtual assistant",
  "searching for a va",
  "searching for a virtual assistant",
  "virtual assistant needed",
  "va needed",

  // Role-specific VA hiring
  "hiring ghl va",
  "hiring gohighlevel va",
  "hiring social media va",
  "hiring real estate va",
  "hiring remote va",
  "hiring executive va",
  "hiring admin va",
  "need va support",

  // Outsource to VA
  "outsource to a va",
  "outsourcing to a va",
  "looking to outsource to a virtual assistant",
  "looking to delegate to a va",

  // Urgency + VA
  "urgently need a va",
  "need a va asap",

  // Hiring tag (Reddit)
  "[hiring]",
];

// ---------------------------------------------------------------------------
// MEDIUM INTENT (+20) — Research / consideration phase
// Person is exploring hiring a VA but hasn't committed yet
// ---------------------------------------------------------------------------

const MEDIUM_INTENT = [
  "any va recommendations",
  "who can recommend a virtual assistant",
  "who can recommend a va",
  "can anyone recommend a va",
  "recommend a good va",
  "recommend a virtual assistant",
  "best va service",
  "best virtual assistant service",
  "how much does a va cost",
  "virtual assistant rates",
  "va pricing",
  "va cost",
  "va rates",
  "where to find a va",
  "where to find a virtual assistant",
  "where to hire a va",
  "is it worth hiring a va",
  "thinking of hiring a va",
  "thinking about hiring a va",
  "considering hiring a va",
  "should i hire a va",
  "has anyone hired a va",
  "anyone use a va",
  "anyone have a va",
  "experience with hiring a va",
];

// ---------------------------------------------------------------------------
// DELEGATION SIGNALS (+15) — Pain points that lead to VA hiring
// Only count when combined with VA/hiring language (checked below)
// ---------------------------------------------------------------------------

const DELEGATION_SIGNALS = [
  "overwhelmed need a va",
  "drowning in tasks need va",
  "need extra help va",
  "scaling my business need a va",
  "need help hiring a va",
];

// ---------------------------------------------------------------------------
// TOOL / SKILL TRIGGERS (+10) — Only meaningful when paired with VA context
// These alone do NOT pass the filter
// ---------------------------------------------------------------------------

const TOOL_TRIGGERS = [
  "ghl va",
  "gohighlevel va",
  "va for crm",
  "va for social media",
  "va for email marketing",
  "va for bookkeeping",
  "va for data entry",
  "va for appointment",
];

// ---------------------------------------------------------------------------
// URGENCY BOOSTERS (+10)
// ---------------------------------------------------------------------------

const URGENCY = [
  "va asap",
  "va urgently",
  "va immediately",
  "hire va asap",
  "need va now",
];

// VA context — post must mention VA/virtual assistant/assistant somewhere
const VA_CONTEXT_REGEX = /\b(virtual assistant|va|remote assistant|admin assistant|executive assistant|personal assistant)\b/i;
const VA_WORD_REGEX = /\bva\b/i;

// Minimum score to pass — raised to 30 to ensure real hiring intent
const MIN_SCORE = 30;

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

  // Reject self-promotion / job seekers
  for (const term of REJECT_TERMS) {
    if (lower.includes(term)) {
      return { pass: false, score: 0, matchedTerms: [term], rejected: true };
    }
  }

  let score = 0;
  const matchedTerms = [];
  let hasVAContext = VA_CONTEXT_REGEX.test(text);

  // High intent (+40) — direct hiring signals
  for (const term of HIGH_INTENT) {
    if (lower.includes(term)) {
      score += 40;
      matchedTerms.push(term);
      hasVAContext = true; // hiring terms imply VA context
    }
  }

  // Medium intent (+20) — research/consideration
  for (const term of MEDIUM_INTENT) {
    if (lower.includes(term)) {
      score += 20;
      matchedTerms.push(term);
      hasVAContext = true;
    }
  }

  // Delegation signals (+15) — only if VA context exists
  for (const term of DELEGATION_SIGNALS) {
    if (lower.includes(term)) {
      if (hasVAContext) {
        score += 15;
        matchedTerms.push(term);
      }
    }
  }

  // Tool triggers (+10) — only count if VA context exists
  for (const term of TOOL_TRIGGERS) {
    if (lower.includes(term)) {
      if (hasVAContext) {
        score += 10;
        matchedTerms.push(term);
      }
    }
  }

  // Urgency (+10)
  for (const term of URGENCY) {
    if (lower.includes(term)) {
      score += 10;
      matchedTerms.push(term);
    }
  }

  // Standalone "VA" mention (+5) — small bonus
  if (VA_WORD_REGEX.test(text)) {
    score += 5;
  }

  const capped = Math.min(score, 100);
  const pass = capped >= MIN_SCORE;

  return { pass, score: capped, matchedTerms, rejected: false };
}
