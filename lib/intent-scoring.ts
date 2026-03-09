import type { IntentLevel, IntentCategory, Platform } from "./types";

// ---------------------------------------------------------------------------
// Weighted keyword dictionaries — VA Hiring Detection Only
//
// OBJECTIVE: Score posts where someone is HIRING or LOOKING TO HIRE a VA.
// Reject job seekers and self-promoters. Only save qualified hiring leads.
// ---------------------------------------------------------------------------

export interface WeightedKeyword {
  phrase: string;
  weight: number;
  category: IntentCategory;
}

export interface NegativeSignal {
  phrase: string;
  weight: number;
}

export interface DynamicScoringConfig {
  positiveSignals?: WeightedKeyword[];
  negativeSignals?: NegativeSignal[];
  targetCountries?: string[];
  highThreshold?: number;
  mediumThreshold?: number;
  engagementBonus?: number;
  countryBonus?: number;
}

const POSITIVE_SIGNALS: WeightedKeyword[] = [
  // ── Direct VA Hiring (+40) ──────────────────────────────────────────
  { phrase: "looking for a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "looking for a va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring a va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring va", weight: 40, category: "Direct Hiring" },
  { phrase: "hire a va", weight: 40, category: "Direct Hiring" },
  { phrase: "hire a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "need a va", weight: 40, category: "Direct Hiring" },
  { phrase: "need a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "want to hire a va", weight: 40, category: "Direct Hiring" },
  { phrase: "want to hire a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "searching for a va", weight: 40, category: "Direct Hiring" },
  { phrase: "searching for a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "virtual assistant needed", weight: 40, category: "Direct Hiring" },
  { phrase: "va needed", weight: 40, category: "Direct Hiring" },

  // ── Role-specific VA hiring (+40) ───────────────────────────────────
  { phrase: "hiring ghl va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring gohighlevel va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring social media va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring real estate va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring remote va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring executive va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring admin va", weight: 40, category: "Direct Hiring" },
  { phrase: "need va support", weight: 40, category: "Direct Hiring" },

  // ── Outsource / delegate to VA (+35) ────────────────────────────────
  { phrase: "outsource to a va", weight: 35, category: "Direct Hiring" },
  { phrase: "outsourcing to a va", weight: 35, category: "Direct Hiring" },
  { phrase: "looking to outsource to a virtual assistant", weight: 35, category: "Direct Hiring" },
  { phrase: "looking to delegate to a va", weight: 35, category: "Direct Hiring" },

  // ── Urgency + VA (+15 bonus, stacks with direct hiring match) ──────
  { phrase: "urgently need a va", weight: 15, category: "Direct Hiring" },
  { phrase: "need a va asap", weight: 15, category: "Direct Hiring" },

  // ── Recommendation Request (+25) ────────────────────────────────────
  { phrase: "any va recommendations", weight: 25, category: "Recommendation Request" },
  { phrase: "who can recommend a virtual assistant", weight: 25, category: "Recommendation Request" },
  { phrase: "who can recommend a va", weight: 25, category: "Recommendation Request" },
  { phrase: "can anyone recommend a va", weight: 25, category: "Recommendation Request" },
  { phrase: "recommend a good va", weight: 25, category: "Recommendation Request" },
  { phrase: "where to find a va", weight: 25, category: "Recommendation Request" },
  { phrase: "where to hire a va", weight: 25, category: "Recommendation Request" },
  { phrase: "thinking of hiring a va", weight: 25, category: "Recommendation Request" },
  { phrase: "considering hiring a va", weight: 25, category: "Recommendation Request" },
  { phrase: "should i hire a va", weight: 25, category: "Recommendation Request" },
  { phrase: "has anyone hired a va", weight: 25, category: "Recommendation Request" },

  // ── Budget Inquiry — VA-specific (+20) ──────────────────────────────
  { phrase: "how much does a va cost", weight: 20, category: "Budget Inquiry" },
  { phrase: "virtual assistant rates", weight: 20, category: "Budget Inquiry" },
  { phrase: "va pricing", weight: 20, category: "Budget Inquiry" },
  { phrase: "va cost", weight: 20, category: "Budget Inquiry" },
  { phrase: "va rates", weight: 20, category: "Budget Inquiry" },
  { phrase: "is it worth hiring a va", weight: 20, category: "Budget Inquiry" },

  // ── Technical VA Request (+10) — only as bonus context ──────────────
  { phrase: "ghl va", weight: 10, category: "Technical VA Request" },
  { phrase: "gohighlevel va", weight: 10, category: "Technical VA Request" },
  { phrase: "va for crm", weight: 10, category: "Technical VA Request" },
  { phrase: "va for social media", weight: 10, category: "Technical VA Request" },
  { phrase: "va for email marketing", weight: 10, category: "Technical VA Request" },
  { phrase: "va for bookkeeping", weight: 10, category: "Technical VA Request" },
  { phrase: "va for data entry", weight: 10, category: "Technical VA Request" },
  { phrase: "va for appointment", weight: 10, category: "Technical VA Request" },
];

const NEGATIVE_SIGNALS: NegativeSignal[] = [
  // Job seeker (-40)
  { phrase: "i am looking for a va job", weight: -40 },
  { phrase: "i'm a virtual assistant", weight: -40 },
  { phrase: "i am a virtual assistant", weight: -40 },
  { phrase: "looking for va work", weight: -40 },
  { phrase: "i'm looking for a va job", weight: -40 },
  { phrase: "[for hire]", weight: -40 },

  // Self-promotion (-30)
  { phrase: "offering va services", weight: -30 },
  { phrase: "i provide va services", weight: -30 },
  { phrase: "hire me", weight: -30 },
  { phrase: "va available", weight: -30 },
  { phrase: "freelance va here", weight: -30 },
  { phrase: "available for hire", weight: -30 },
  { phrase: "open for clients", weight: -30 },
  { phrase: "looking for work", weight: -30 },
  { phrase: "i will be your virtual assistant", weight: -30 },
  { phrase: "i can be your va", weight: -30 },
  { phrase: "my services include", weight: -30 },
  { phrase: "services i offer", weight: -30 },
  { phrase: "dm me for", weight: -20 },
  { phrase: "dm for rates", weight: -20 },
];

const TARGET_COUNTRIES = [
  "united states", "us-based", "us timezone", "us hours",
  "united kingdom", "uk-based",
  "australia", "australian",
  "canada", "canadian",
];

// ---------------------------------------------------------------------------
// Scoring function
// ---------------------------------------------------------------------------

export interface ScoringInput {
  text: string;
  engagement: number;
  platform: Platform;
}

export interface ScoringResult {
  score: number;
  level: IntentLevel;
  category: IntentCategory;
  matchedKeywords: string[];
}

export function scoreIntent(
  input: ScoringInput,
  dynamicConfig?: DynamicScoringConfig
): ScoringResult {
  const lower = input.text.toLowerCase();
  let totalScore = 0;
  const matchedKeywords: string[] = [];
  const matchedCategories: IntentCategory[] = [];
  const matchedPhrases = new Set<string>();

  const positives = dynamicConfig?.positiveSignals ?? POSITIVE_SIGNALS;
  const negatives = dynamicConfig?.negativeSignals ?? NEGATIVE_SIGNALS;
  const countries = dynamicConfig?.targetCountries ?? TARGET_COUNTRIES;
  const highThreshold = dynamicConfig?.highThreshold ?? 65;
  const mediumThreshold = dynamicConfig?.mediumThreshold ?? 35;
  const engagementBonus = dynamicConfig?.engagementBonus ?? 5;
  const countryBonus = dynamicConfig?.countryBonus ?? 10;

  // Positive signals
  for (const signal of positives) {
    if (lower.includes(signal.phrase) && !matchedPhrases.has(signal.phrase)) {
      matchedPhrases.add(signal.phrase);
      totalScore += signal.weight;
      matchedKeywords.push(signal.phrase);
      matchedCategories.push(signal.category);
    }
  }

  // Negative signals
  for (const signal of negatives) {
    if (lower.includes(signal.phrase) && !matchedPhrases.has(signal.phrase)) {
      matchedPhrases.add(signal.phrase);
      totalScore += signal.weight;
      matchedKeywords.push(signal.phrase);
    }
  }

  // Country match bonus
  for (const country of countries) {
    if (lower.includes(country.toLowerCase())) {
      totalScore += countryBonus;
      break;
    }
  }

  // Engagement threshold bonus
  if (input.engagement > 5) {
    totalScore += engagementBonus;
  }

  const score = Math.max(0, Math.min(100, totalScore));

  let level: IntentLevel;
  if (score >= highThreshold) level = "High";
  else if (score >= mediumThreshold) level = "Medium";
  else level = "Low";

  const categoryCounts = matchedCategories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const category = (Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "Delegation Signal") as IntentCategory;

  return { score, level, category, matchedKeywords };
}
