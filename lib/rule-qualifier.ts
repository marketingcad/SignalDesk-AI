import type { AIQualificationResult, Platform } from "./types";
import { matchKeywords } from "./keywords";
import { inferLocationFromText } from "./geo-fallback";

// ---------------------------------------------------------------------------
// Rule-based VA qualifier — deterministic fallback for when the AI is down.
//
// Produces the SAME shape as the AI qualifier (AIQualificationResult) so the
// relevance gate, geo analytics, and lead summary keep working without the AI.
// Crucially it uses the SHARED FUZZY matcher (matchKeywords) — the same one the
// scraper and the keyword gate use — so genuine leads with slightly different
// wording (e.g. "WE'RE HIRING: ... GHL VA" vs the keyword "hiring ghl va") are
// kept instead of dropped, which was the strict-keyword fallback's failure mode.
//
// It is intentionally SELECTIVE (not "insert everything"): seeking/self-promo
// and spam are classified NOT_RELATED so the gate still rejects them.
// ---------------------------------------------------------------------------

// Tool names that signal a technical VA request (drives `tools`).
const TOOL_TERMS = [
  "gohighlevel", "ghl", "clickfunnels", "hubspot", "salesforce", "zapier",
  "quickbooks", "shopify", "wordpress", "canva", "mailchimp", "monday",
  "notion", "asana", "trello", "close", "airtable", "slack",
];

// Substring → normalized task label (drives `tasks`).
const TASK_TERMS: Record<string, string> = {
  "data entry": "data entry",
  inbox: "inbox management",
  "email management": "email management",
  calendar: "calendar management",
  appointment: "appointment setting",
  "cold call": "cold calling",
  "social media": "social media management",
  bookkeeping: "bookkeeping",
  payroll: "payroll",
  "customer service": "customer service",
  "customer support": "customer support",
  "lead generation": "lead generation",
  "video editing": "video editing",
  "content writ": "content writing",
  funnel: "funnel building",
  automation: "automation",
  crm: "crm management",
  website: "web development",
};

const URGENCY_HIGH = ["asap", "urgent", "urgently", "immediately", "start now", "right away", "start asap"];
const URGENCY_MED = ["soon", "this week", "next week", "planning to hire", "looking to hire", "long-term", "long term"];

// Strong spam/MLM signals → reject outright.
const SCAM_TERMS = [
  "earn $", "make money fast", "work from home opportunity", "be your own boss",
  "unlimited income", "investment opportunity", "financial freedom",
  "passive income guaranteed", "join my team and earn",
];

const HOURLY_RATE = /\$\s?(\d{1,3})\s?(?:\/|per\s)?(?:hr|hour)/i;

export interface RuleQualifierInput {
  platform: Platform;
  text: string;
  source?: string;
  authorLocation?: string;
  detectedLanguage?: string;
}

/**
 * Qualify a post deterministically, returning an AIQualificationResult-shaped
 * verdict. Pass the same hiring/seeking keyword lists the rest of the system
 * uses (DB keywords, or the static defaults).
 */
export function qualifyLeadWithRules(
  input: RuleQualifierInput,
  hiringKeywords: string[],
  seekingKeywords: string[]
): AIQualificationResult {
  const text = input.text || "";
  const lower = text.toLowerCase();

  const hiringMatches = matchKeywords(text, hiringKeywords);
  const seekingMatches = matchKeywords(text, seekingKeywords);
  const scam = SCAM_TERMS.find((t) => lower.includes(t));

  // Seeking-first (like classifyText), but require seeking to *dominate* —
  // fuzzy matching can clip a stray seeking phrase out of a real hiring post,
  // so we only treat it as seeking when it's at least as strong as hiring.
  const seekingDominant =
    !scam && seekingMatches.length > 0 && seekingMatches.length >= hiringMatches.length;

  let isHiring: AIQualificationResult["isHiring"];
  let intentCategory: AIQualificationResult["intentCategory"];
  let leadScore: number;

  if (scam || seekingDominant) {
    isHiring = false;
    intentCategory = "NOT_RELATED";
    leadScore = 1;
  } else if (hiringMatches.length >= 3) {
    isHiring = true;
    intentCategory = "HIGH_INTENT";
    leadScore = 8; // capped below 10 — a rule match shouldn't outrank real AI
  } else if (hiringMatches.length >= 1) {
    isHiring = true;
    intentCategory = "MEDIUM_INTENT";
    leadScore = 6;
  } else {
    isHiring = "uncertain";
    intentCategory = "NOT_RELATED";
    leadScore = 1;
  }

  const urgency: AIQualificationResult["urgency"] = URGENCY_HIGH.some((t) => lower.includes(t))
    ? "HIGH"
    : URGENCY_MED.some((t) => lower.includes(t)) || intentCategory === "HIGH_INTENT"
    ? "MEDIUM"
    : "LOW";

  const tools = TOOL_TERMS.filter((t) => lower.includes(t));
  const tasks = Array.from(
    new Set(Object.entries(TASK_TERMS).filter(([k]) => lower.includes(k)).map(([, v]) => v))
  );

  const location =
    inferLocationFromText(text, input.source ?? "", input.authorLocation, input.detectedLanguage) ?? "Others";

  const rate = text.match(HOURLY_RATE);
  const budgetEstimate: AIQualificationResult["budgetEstimate"] = rate
    ? Number(rate[1]) < 8
      ? "hourly_low"
      : Number(rate[1]) < 20
      ? "hourly_mid"
      : "hourly_high"
    : /per month|monthly|retainer|\/mo\b/i.test(lower)
    ? "monthly_contract"
    : "unknown";

  const spamRisk: AIQualificationResult["spamRisk"] = scam ? "LIKELY_SCAM" : seekingDominant ? "SUSPICIOUS" : "SAFE";

  const summaryBody =
    isHiring === true
      ? `Likely hiring a VA${tasks.length ? ` for ${tasks.slice(0, 3).join(", ")}` : ""}` +
        `${tools.length ? ` (tools: ${tools.slice(0, 3).join(", ")})` : ""}.` +
        ` Matched ${hiringMatches.length} hiring keyword(s).`
      : scam
      ? "Looks like spam/scam — rejected."
      : seekingDominant
      ? "Looks like a VA offering services / job seeker — not a lead."
      : "Unclear hiring intent.";

  return {
    isHiring,
    intentCategory,
    leadScore,
    urgency,
    tasks,
    skills: [],
    tools,
    industry: "unknown",
    location,
    budgetEstimate,
    spamRisk,
    spamReason: scam ? `matched "${scam}"` : "",
    leadSummary: `[rule-based fallback] ${summaryBody} Location: ${location}.`,
  };
}
