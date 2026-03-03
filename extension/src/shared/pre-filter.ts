/**
 * Lightweight client-side keyword check.
 * Prevents sending irrelevant posts to the backend API.
 * The backend does the full weighted scoring — this is just a quick gate.
 *
 * IMPORTANT: Every keyword from the scoring engine must have at least one
 * partial match here, otherwise valid posts get silently dropped.
 */

const QUICK_MATCH_KEYWORDS = [
  // --- Direct Hiring signals ---
  "virtual assistant", "va ", " va", "hiring", "looking for",
  "need someone", "need a va", "need admin", "remote assistant",
  "executive assistant", "cold caller", "appointment setter",
  "outsourc", "manage my crm", "handle admin", "manage emails",
  "book appointments", "help with inbox", "urgent",

  // --- Recommendation & Budget signals ---
  "va recommendations", "recommend a virtual", "best va",
  "va cost", "va pricing", "va rates", "worth hiring",
  "where to find a va",

  // --- Delegation / Overwhelm signals ---
  "help in my business", "support in my business",
  "overwhelmed", "drowning in tasks", "too many client",
  "scaling my business", "need extra help", "delegate",
  "admin work",

  // --- Tool / Skill-based triggers ---
  "crm", "gohighlevel", "ghl", "zapier", "clickfunnels",
  "hubspot", "salesforce", "quickbooks",
  "automation setup", "funnel building", "lead management",
  "appointment booking", "email marketing",
  "social media management", "facebook ads",
  "tiktok management", "bookkeeping", "data entry",
  "customer support",

  // --- Urgency ---
  "asap", "urgently", "immediately",

  // --- Negative (still send — backend handles scoring) ---
  "hire me", "va available", "offering va services",
  "looking for a va job", "i provide va", "freelance va",
  "looking for work", "open for clients", "available for hire",
];

export function passesPreFilter(text: string): boolean {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();
  const matched = QUICK_MATCH_KEYWORDS.find((kw) => lower.includes(kw));
  if (matched) {
    console.log(`[SignalDesk] Pre-filter PASSED — matched: "${matched}"`);
    return true;
  }
  return false;
}
