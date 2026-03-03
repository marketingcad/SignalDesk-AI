// ---------------------------------------------------------------------------
// Shared keyword lists — single source of truth for all platform monitors
// Aligned with the app's settings page keyword configuration
// ---------------------------------------------------------------------------

/** Primary + secondary hiring signals from settings */
export const HIRING_KEYWORDS: string[] = [
  // Primary (+40 intent score)
  "looking for a virtual assistant",
  "hiring a virtual assistant",
  "need a va",
  "hiring remote assistant",
  "hiring ghl va",
  "need someone to manage my crm",
  "hiring immediately va",
  // Secondary (+20 intent score)
  "any va recommendations",
  "how much does a va cost",
  "thinking of hiring a va",
  "overwhelmed with admin",
  "need extra help in my business",
  // Additional platform-specific
  "hiring va",
  "virtual assistant needed",
  "looking for va",
  "need a virtual assistant",
  "hiring asap",
];

/** Negative keywords repurposed as seeking-work signals */
export const SEEKING_KEYWORDS: string[] = [
  "i am looking for a va job",
  "i'm a virtual assistant",
  "offering va services",
  "hire me",
  "va available",
  // Additional platform-specific
  "looking for work",
  "open for clients",
  "available for hire",
];

export type PostClassification = "HIRING_VA" | "SEEKING_WORK" | null;

/**
 * Classify text against hiring/seeking keywords.
 * Case-insensitive. Returns null if no match (IRRELEVANT).
 */
export function classifyText(text: string): PostClassification {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const kw of HIRING_KEYWORDS) {
    if (lower.includes(kw)) return "HIRING_VA";
  }
  for (const kw of SEEKING_KEYWORDS) {
    if (lower.includes(kw)) return "SEEKING_WORK";
  }
  return null;
}
