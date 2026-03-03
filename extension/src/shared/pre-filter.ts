/**
 * Lightweight client-side keyword check.
 * Prevents sending irrelevant posts to the backend API.
 * The backend does the full weighted scoring — this is just a quick gate.
 */

const QUICK_MATCH_KEYWORDS = [
  // Hiring signals
  "virtual assistant", "va ", " va", "hiring", "looking for",
  "need someone", "help in my business", "admin work",
  "delegate", "outsource", "appointment", "remote assistant",
  // Tools (paired with hiring context)
  "crm", "gohighlevel", "ghl", "zapier", "clickfunnels",
  "hubspot", "salesforce", "quickbooks",
  // Urgency
  "asap", "urgently", "immediately",
  // Recommendations
  "va recommendations", "va cost", "va pricing", "va rates",
  // Negative (still send — backend handles scoring)
  "hire me", "va available", "offering va services",
  "looking for a va job",
];

export function passesPreFilter(text: string): boolean {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();
  return QUICK_MATCH_KEYWORDS.some((kw) => lower.includes(kw));
}
