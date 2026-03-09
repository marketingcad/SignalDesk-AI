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
  // Direct hiring signals — must mention VA / virtual assistant
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
  "hiring social media va",
  "hiring real estate va",
  "hiring remote va",
  "hiring executive va",
  "hiring admin va",
  "need va support",

  // Outsourcing to a VA
  "outsource to a va",
  "outsourcing to a va",
  "looking to outsource to a virtual assistant",
  "looking to delegate to a va",

  // Research / consideration — VA-specific
  "any va recommendations",
  "recommend a good va",
  "can anyone recommend a va",
  "how much does a va cost",
  "thinking of hiring a va",
  "considering hiring a va",
  "should i hire a va",
  "where to find a va",
  "where to hire a va",
  "has anyone hired a va",
  "va pricing",
  "va rates",
  "va cost",

  // Urgency — VA-specific
  "urgently need a va",
  "need a va asap",

  // Reddit tag
  "[hiring]",
];

export const SEEKING_KEYWORDS: string[] = [
  // Self-identification
  "i'm a virtual assistant",
  "i am a virtual assistant",
  "i'm a va",
  "i am a va",
  "freelance va here",

  // Offering services
  "offering va services",
  "i provide va services",
  "hire me",
  "va available",
  "available for hire",
  "open for clients",
  "looking for work",
  "looking for clients",
  "looking for va work",
  "looking for a va job",
  "i will be your virtual assistant",
  "i can be your va",
  "my services include",
  "services i offer",
  "dm me for",
  "dm for rates",

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
