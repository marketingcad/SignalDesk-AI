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
  // Direct Hiring (+40)
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
  { phrase: "looking to hire", weight: 40, category: "Direct Hiring" },
  { phrase: "want to hire", weight: 40, category: "Direct Hiring" },
  { phrase: "ready to hire", weight: 40, category: "Direct Hiring" },
  { phrase: "planning to hire", weight: 40, category: "Direct Hiring" },

  // Role-specific hiring (+40)
  { phrase: "hiring remote assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring executive assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring admin assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring personal assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring ghl va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring gohighlevel va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring social media va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring real estate va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring cold caller", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring appointment setter", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring bookkeeper", weight: 40, category: "Direct Hiring" },

  // Task-specific hiring (+40)
  { phrase: "need someone to manage my crm", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to handle admin", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to manage emails", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to book appointments", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to manage my social", weight: 40, category: "Direct Hiring" },
  { phrase: "need help with inbox", weight: 40, category: "Direct Hiring" },
  { phrase: "need admin support", weight: 40, category: "Direct Hiring" },
  { phrase: "need va support", weight: 40, category: "Direct Hiring" },
  { phrase: "outsourcing admin work", weight: 40, category: "Direct Hiring" },
  { phrase: "outsource to a va", weight: 40, category: "Direct Hiring" },
  { phrase: "looking to outsource", weight: 40, category: "Direct Hiring" },
  { phrase: "looking to delegate", weight: 40, category: "Direct Hiring" },

  // Urgency + hiring (+20)
  { phrase: "hiring immediately", weight: 20, category: "Direct Hiring" },
  { phrase: "hiring asap", weight: 20, category: "Direct Hiring" },
  { phrase: "urgently need a va", weight: 20, category: "Direct Hiring" },
  { phrase: "urgently hiring", weight: 20, category: "Direct Hiring" },
  { phrase: "asap", weight: 10, category: "Direct Hiring" },
  { phrase: "urgently", weight: 10, category: "Direct Hiring" },
  { phrase: "immediately", weight: 10, category: "Direct Hiring" },

  // Recommendation Request (+20)
  { phrase: "any va recommendations", weight: 20, category: "Recommendation Request" },
  { phrase: "who can recommend a virtual assistant", weight: 20, category: "Recommendation Request" },
  { phrase: "who can recommend a va", weight: 20, category: "Recommendation Request" },
  { phrase: "can anyone recommend a va", weight: 20, category: "Recommendation Request" },
  { phrase: "recommend a good va", weight: 20, category: "Recommendation Request" },
  { phrase: "best va service", weight: 20, category: "Recommendation Request" },
  { phrase: "where to find a va", weight: 20, category: "Recommendation Request" },
  { phrase: "where to hire a va", weight: 20, category: "Recommendation Request" },
  { phrase: "thinking of hiring a va", weight: 20, category: "Recommendation Request" },
  { phrase: "considering hiring a va", weight: 20, category: "Recommendation Request" },
  { phrase: "should i hire a va", weight: 20, category: "Recommendation Request" },
  { phrase: "has anyone hired a va", weight: 20, category: "Recommendation Request" },

  // Budget Inquiry (+20)
  { phrase: "how much does a va cost", weight: 20, category: "Budget Inquiry" },
  { phrase: "virtual assistant rates", weight: 20, category: "Budget Inquiry" },
  { phrase: "va pricing", weight: 20, category: "Budget Inquiry" },
  { phrase: "va cost", weight: 20, category: "Budget Inquiry" },
  { phrase: "va rates", weight: 20, category: "Budget Inquiry" },
  { phrase: "is it worth hiring a va", weight: 20, category: "Budget Inquiry" },

  // Delegation Signal (+15)
  { phrase: "overwhelmed with admin", weight: 15, category: "Delegation Signal" },
  { phrase: "overwhelmed with tasks", weight: 15, category: "Delegation Signal" },
  { phrase: "drowning in tasks", weight: 15, category: "Delegation Signal" },
  { phrase: "drowning in admin", weight: 15, category: "Delegation Signal" },
  { phrase: "drowning in emails", weight: 15, category: "Delegation Signal" },
  { phrase: "too many client messages", weight: 15, category: "Delegation Signal" },
  { phrase: "need extra help in my business", weight: 15, category: "Delegation Signal" },
  { phrase: "need support in my business", weight: 15, category: "Delegation Signal" },
  { phrase: "scaling my business and need help", weight: 15, category: "Delegation Signal" },
  { phrase: "scaling my business", weight: 15, category: "Delegation Signal" },

  // Tool-specific (+10) — only meaningful with VA hiring context
  { phrase: "gohighlevel", weight: 10, category: "Technical VA Request" },
  { phrase: "ghl", weight: 10, category: "Technical VA Request" },
  { phrase: "clickfunnels", weight: 10, category: "Technical VA Request" },
  { phrase: "hubspot", weight: 10, category: "Technical VA Request" },
  { phrase: "salesforce", weight: 10, category: "Technical VA Request" },
  { phrase: "zapier", weight: 10, category: "Technical VA Request" },
  { phrase: "crm setup", weight: 10, category: "Technical VA Request" },
  { phrase: "automation setup", weight: 10, category: "Technical VA Request" },
  { phrase: "funnel building", weight: 10, category: "Technical VA Request" },
  { phrase: "lead management", weight: 10, category: "Technical VA Request" },
  { phrase: "appointment booking", weight: 10, category: "Technical VA Request" },
  { phrase: "email marketing", weight: 10, category: "Technical VA Request" },
  { phrase: "social media management", weight: 10, category: "Technical VA Request" },
  { phrase: "bookkeeping", weight: 10, category: "Technical VA Request" },
  { phrase: "data entry", weight: 10, category: "Technical VA Request" },
  { phrase: "customer support", weight: 10, category: "Technical VA Request" },
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
  const highThreshold = dynamicConfig?.highThreshold ?? 80;
  const mediumThreshold = dynamicConfig?.mediumThreshold ?? 50;
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
