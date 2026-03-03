import type { IntentLevel, IntentCategory, Platform } from "./types";

// ---------------------------------------------------------------------------
// Weighted keyword dictionaries
// ---------------------------------------------------------------------------

interface WeightedKeyword {
  phrase: string;
  weight: number;
  category: IntentCategory;
}

const POSITIVE_SIGNALS: WeightedKeyword[] = [
  // Direct Hiring (+40)
  { phrase: "looking for a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "need a va", weight: 40, category: "Direct Hiring" },
  { phrase: "need a virtual assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "want to hire a va", weight: 40, category: "Direct Hiring" },
  { phrase: "searching for a va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring remote assistant", weight: 40, category: "Direct Hiring" },
  { phrase: "need admin support", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring executive assistant remote", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring ghl va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring gohighlevel va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring social media va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring real estate va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring cold caller va", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring appointment setter", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to manage my crm", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to handle admin", weight: 40, category: "Direct Hiring" },
  { phrase: "need help with inbox", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to manage emails", weight: 40, category: "Direct Hiring" },
  { phrase: "need someone to book appointments", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring immediately va", weight: 40, category: "Direct Hiring" },
  { phrase: "urgent va hire", weight: 40, category: "Direct Hiring" },
  { phrase: "outsourcing admin work", weight: 40, category: "Direct Hiring" },
  { phrase: "hiring va", weight: 40, category: "Direct Hiring" },
  { phrase: "virtual assistant needed", weight: 40, category: "Direct Hiring" },
  { phrase: "looking for va", weight: 40, category: "Direct Hiring" },

  // Recommendation Request (+20)
  { phrase: "any va recommendations", weight: 20, category: "Recommendation Request" },
  { phrase: "who can recommend a virtual assistant", weight: 20, category: "Recommendation Request" },
  { phrase: "best va service", weight: 20, category: "Recommendation Request" },
  { phrase: "where to find a va", weight: 20, category: "Recommendation Request" },
  { phrase: "thinking of hiring a va", weight: 20, category: "Recommendation Request" },

  // Budget Inquiry (+20)
  { phrase: "how much does a va cost", weight: 20, category: "Budget Inquiry" },
  { phrase: "virtual assistant rates", weight: 20, category: "Budget Inquiry" },
  { phrase: "va pricing", weight: 20, category: "Budget Inquiry" },
  { phrase: "is it worth hiring a va", weight: 20, category: "Budget Inquiry" },

  // Delegation Signal (+15)
  { phrase: "overwhelmed with admin", weight: 15, category: "Delegation Signal" },
  { phrase: "need extra help in my business", weight: 15, category: "Delegation Signal" },
  { phrase: "drowning in tasks", weight: 15, category: "Delegation Signal" },
  { phrase: "too many client messages", weight: 15, category: "Delegation Signal" },
  { phrase: "need support in my business", weight: 15, category: "Delegation Signal" },
  { phrase: "scaling my business and need help", weight: 15, category: "Delegation Signal" },

  // Urgency (+20)
  { phrase: "asap", weight: 20, category: "Direct Hiring" },
  { phrase: "urgently", weight: 20, category: "Direct Hiring" },
  { phrase: "immediately", weight: 20, category: "Direct Hiring" },
  { phrase: "hiring asap", weight: 20, category: "Direct Hiring" },

  // Tool-specific (+15)
  { phrase: "gohighlevel", weight: 15, category: "Technical VA Request" },
  { phrase: "ghl", weight: 15, category: "Technical VA Request" },
  { phrase: "clickfunnels", weight: 15, category: "Technical VA Request" },
  { phrase: "hubspot", weight: 15, category: "Technical VA Request" },
  { phrase: "salesforce", weight: 15, category: "Technical VA Request" },
  { phrase: "zapier", weight: 15, category: "Technical VA Request" },
  { phrase: "crm setup", weight: 15, category: "Technical VA Request" },
  { phrase: "automation setup", weight: 15, category: "Technical VA Request" },
  { phrase: "funnel building", weight: 15, category: "Technical VA Request" },
  { phrase: "lead management", weight: 15, category: "Technical VA Request" },
  { phrase: "appointment booking", weight: 15, category: "Technical VA Request" },
  { phrase: "email marketing", weight: 15, category: "Technical VA Request" },
  { phrase: "social media management", weight: 15, category: "Technical VA Request" },
  { phrase: "facebook ads support", weight: 15, category: "Technical VA Request" },
  { phrase: "tiktok management", weight: 15, category: "Technical VA Request" },
  { phrase: "bookkeeping", weight: 15, category: "Technical VA Request" },
  { phrase: "quickbooks", weight: 15, category: "Technical VA Request" },
  { phrase: "data entry", weight: 15, category: "Technical VA Request" },
  { phrase: "customer support", weight: 15, category: "Technical VA Request" },
];

interface NegativeSignal {
  phrase: string;
  weight: number;
}

const NEGATIVE_SIGNALS: NegativeSignal[] = [
  // Job seeker (-40)
  { phrase: "i am looking for a va job", weight: -40 },
  { phrase: "i'm a virtual assistant", weight: -40 },
  { phrase: "looking for va work", weight: -40 },
  { phrase: "i'm looking for a va job", weight: -40 },

  // Self-promotion (-30)
  { phrase: "offering va services", weight: -30 },
  { phrase: "i provide va services", weight: -30 },
  { phrase: "hire me", weight: -30 },
  { phrase: "va available", weight: -30 },
  { phrase: "freelance va here", weight: -30 },
  { phrase: "available for hire", weight: -30 },
  { phrase: "open for clients", weight: -30 },
  { phrase: "looking for work", weight: -30 },
];

// Target countries for +10 bonus
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

export function scoreIntent(input: ScoringInput): ScoringResult {
  const lower = input.text.toLowerCase();
  let totalScore = 0;
  const matchedKeywords: string[] = [];
  const matchedCategories: IntentCategory[] = [];
  const matchedPhrases = new Set<string>();

  // Positive signals
  for (const signal of POSITIVE_SIGNALS) {
    if (lower.includes(signal.phrase) && !matchedPhrases.has(signal.phrase)) {
      matchedPhrases.add(signal.phrase);
      totalScore += signal.weight;
      matchedKeywords.push(signal.phrase);
      matchedCategories.push(signal.category);
    }
  }

  // Negative signals
  for (const signal of NEGATIVE_SIGNALS) {
    if (lower.includes(signal.phrase) && !matchedPhrases.has(signal.phrase)) {
      matchedPhrases.add(signal.phrase);
      totalScore += signal.weight;
      matchedKeywords.push(signal.phrase);
    }
  }

  // Country match bonus (+10)
  for (const country of TARGET_COUNTRIES) {
    if (lower.includes(country)) {
      totalScore += 10;
      break;
    }
  }

  // Engagement threshold bonus (+5 if > 5 reactions)
  if (input.engagement > 5) {
    totalScore += 5;
  }

  // Clamp score to 0-100
  const score = Math.max(0, Math.min(100, totalScore));

  // Determine level
  let level: IntentLevel;
  if (score >= 80) level = "High";
  else if (score >= 50) level = "Medium";
  else level = "Low";

  // Determine primary category (most frequently matched)
  const categoryCounts = matchedCategories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const category = (Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "Delegation Signal") as IntentCategory;

  return { score, level, category, matchedKeywords };
}
