// ---------------------------------------------------------------------------
// Shared keyword lists — VA Hiring Detection Only
//
// HIRING_KEYWORDS: Someone is looking to HIRE a VA (these are leads)
// SEEKING_KEYWORDS: A VA is looking for WORK (reject these)
//
// IMPORTANT: Check SEEKING first — a post advertising VA services may also
// contain hiring-related words. Seeking takes priority to avoid false leads.
// ---------------------------------------------------------------------------

export const HIRING_KEYWORDS: string[] = [
  // Direct hiring signals
  "looking for a virtual assistant",
  "looking for a va",
  "hiring a virtual assistant",
  "hiring a va",
  "hiring va",
  "hire a va",
  "need a va",
  "need a virtual assistant",
  "want to hire a va",
  "searching for a va",
  "virtual assistant needed",
  "va needed",
  "looking to hire",
  "want to hire",
  "ready to hire",

  // Role-specific
  "hiring remote assistant",
  "hiring executive assistant",
  "hiring ghl va",
  "hiring appointment setter",
  "hiring cold caller",
  "hiring bookkeeper",
  "hiring social media va",
  "hiring real estate va",
  "need admin support",
  "need someone to manage my crm",

  // Research / consideration
  "any va recommendations",
  "how much does a va cost",
  "thinking of hiring a va",
  "should i hire a va",
  "where to find a va",
  "va pricing",
  "va rates",

  // Delegation pain points
  "overwhelmed with admin",
  "need extra help in my business",
  "drowning in tasks",
  "scaling my business and need help",

  // Urgency
  "hiring asap",
  "hiring immediately",
  "urgently need a va",

  // Reddit tag
  "[hiring]",
];

export const SEEKING_KEYWORDS: string[] = [
  // Self-identification
  "i'm a virtual assistant",
  "i am a virtual assistant",
  "i'm a va",
  "i am a va",

  // Offering services
  "offering va services",
  "i provide va services",
  "hire me",
  "va available",
  "available for hire",
  "open for clients",
  "looking for work",
  "looking for clients",
  "i will be your virtual assistant",
  "i can be your va",
  "my services include",
  "services i offer",
  "dm me for",

  // Reddit tag
  "[for hire]",
];

export type PostClassification = "HIRING_VA" | "SEEKING_WORK" | null;

/**
 * Classify text against hiring/seeking keywords.
 * Case-insensitive. Returns null if no match (IRRELEVANT).
 * Checks SEEKING first to avoid false positives from VAs advertising.
 */
export function classifyText(text: string): PostClassification {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Check seeking FIRST — VA self-promo may contain hiring words
  for (const kw of SEEKING_KEYWORDS) {
    if (lower.includes(kw)) return "SEEKING_WORK";
  }
  for (const kw of HIRING_KEYWORDS) {
    if (lower.includes(kw)) return "HIRING_VA";
  }
  return null;
}
