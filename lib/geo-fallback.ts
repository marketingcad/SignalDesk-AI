// ---------------------------------------------------------------------------
// Keyword-based geographic fallback — used when AI classification is
// unavailable or returns "Others" with no confidence.
// ---------------------------------------------------------------------------

type TargetCountry = "Philippines" | "India" | "United States" | "United Kingdom" | "Australia";

interface GeoPattern {
  regex: RegExp;
  country: TargetCountry;
}

// Ordered from most specific → least specific to avoid false positives
const GEO_PATTERNS: GeoPattern[] = [
  // Philippines
  { regex: /\b(philippines?|filipino|filipina|pinoy|pinay|manila|cebu|davao|makati|tagalog|visayas|mindanao|pampanga)\b/i, country: "Philippines" },
  // India
  { regex: /\b(india|indian|mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|pune|jaipur|hindi)\b/i, country: "India" },
  // United Kingdom
  { regex: /\b(united kingdom|uk|british|britain|london|manchester|birmingham|scotland|wales|england|liverpool|leeds|edinburgh|belfast|bristol)\b/i, country: "United Kingdom" },
  // Australia
  { regex: /\b(australia|australian|aussie|sydney|melbourne|brisbane|perth|adelaide|canberra|queensland|victoria)\b/i, country: "Australia" },
  // United States — last because "$" and generic terms can false-positive
  { regex: /\b(united states|\busa\b|u\.s\.a?\.?|american|new york|california|texas|florida|chicago|los angeles|san francisco|seattle|boston|atlanta|denver|arizona|ohio|virginia)\b/i, country: "United States" },
];

// Language code → country mapping (from X/tweet lang attributes)
const LANG_COUNTRY_MAP: Record<string, TargetCountry> = {
  tl: "Philippines",   // Tagalog
  fil: "Philippines",  // Filipino
  ceb: "Philippines",  // Cebuano
  hi: "India",         // Hindi
  ta: "India",         // Tamil
  te: "India",         // Telugu
  mr: "India",         // Marathi
  bn: "India",         // Bengali
  gu: "India",         // Gujarati
  kn: "India",         // Kannada
  ml: "India",         // Malayalam
  pa: "India",         // Punjabi
};

/**
 * Infer geographic location from all available text signals.
 * Returns one of the 5 target countries or null (caller should use "Others").
 */
export function inferLocationFromText(
  text: string,
  source: string,
  authorLocation?: string,
  detectedLanguage?: string,
): string | null {
  // Priority 1: Author profile location (most reliable — self-declared)
  if (authorLocation) {
    const locMatch = matchPatterns(authorLocation);
    if (locMatch) return locMatch;
  }

  // Priority 2: Language attribute (strong correlational signal)
  if (detectedLanguage) {
    const langCountry = LANG_COUNTRY_MAP[detectedLanguage.toLowerCase()];
    if (langCountry) return langCountry;
  }

  // Priority 3: Community/group name (contextual signal)
  if (source && source !== "X Feed" && source !== "LinkedIn Feed" && source !== "Facebook Group" && source !== "Reddit") {
    const sourceMatch = matchPatterns(source);
    if (sourceMatch) return sourceMatch;
  }

  // Priority 4: Post text content (weakest signal)
  const textMatch = matchPatterns(text);
  if (textMatch) return textMatch;

  return null;
}

function matchPatterns(input: string): TargetCountry | null {
  for (const { regex, country } of GEO_PATTERNS) {
    if (regex.test(input)) return country;
  }
  return null;
}
