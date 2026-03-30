# Lead Geography

How geographic classification works for leads in Signal Desk AI.

---

## Overview

Every lead captured by the browser extension is classified into one of **6 geographic buckets** using a multi-layered detection system: metadata extraction from the DOM, AI-powered text analysis, and keyword-based regex fallback. This data is aggregated and displayed as charts on the Dashboard and Reports pages.

### Geographic Buckets

| Country        | Code | Chart Color      |
| -------------- | ---- | ---------------- |
| Philippines    | PH   | Indigo `#6366f1` |
| India          | IN   | Purple `#8b5cf6` |
| United States  | US   | Emerald `#34d399`|
| United Kingdom | GB   | Amber `#f59e0b`  |
| Australia      | AU   | Light Indigo `#818cf8` |
| Others         | OT   | Zinc `#71717a`   |

---

## Data Flow

```
Browser Extension ──→ API (process/batch) ──→ Location Resolution ──→ Supabase ──→ Geography API ──→ Chart
      │                                              │
      │ Extracts:                                    ├─ 1. Author profile location (from extension)
      │  • post text                                 ├─ 2. AI classification (Gemini)
      │  • author location                           ├─ 3. Community/group name match
      │  • detected language                         ├─ 4. Language code mapping
      │  • community/group name                      └─ 5. Keyword regex fallback
      │
```

### Step 1: Lead Capture + Metadata Extraction

The browser extension extracts posts from Facebook, LinkedIn, Reddit, and X. In addition to the standard fields (text, username, URL, engagement), the extension now captures **geographic metadata** from the DOM:

| Platform | Standard Fields | Geographic Metadata |
| -------- | --------------- | ------------------- |
| Facebook | text, username, URL, engagement, timestamp | `authorLocation` (profile intro card / hover tooltip), `source` (group name) |
| LinkedIn | text, username, URL, engagement, timestamp | `authorLocation` (subtitle: "City, Country" below author name), `source` (group name if in a LinkedIn Group) |
| Reddit   | title + body, username, URL, score, timestamp | `authorLocation` (user flair — may contain location), `source` (subreddit name) |
| X        | tweet text, username, URL, likes + retweets, timestamp | `authorLocation` (bio location from hover card), `detectedLanguage` (tweet `lang` attribute), `source` (community name if in X Community) |

**ExtractedPost payload** sent to the API:
```typescript
{
  platform: "Facebook" | "LinkedIn" | "Reddit" | "X";
  text: string;
  username: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;               // group name, subreddit, community, or feed label
  authorLocation?: string;      // NEW — profile location from DOM
  detectedLanguage?: string;    // NEW — lang attribute (X only)
}
```

### Step 2: Location Resolution (Multi-Layer)

When a lead is processed (`/api/leads/process` or `/api/leads/batch`), geographic location is resolved using a **priority chain**. The system tries each layer in order and uses the first confident match:

```
┌─────────────────────────────────────────────────────────┐
│  PRIORITY 1: Author Profile Location (from extension)   │
│  Most reliable — self-declared by the user              │
│  e.g. "Manila, Philippines", "London, UK"               │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 2: AI Classification (Google Gemini)          │
│  Analyzes full context: text + metadata + all signals   │
│  The AI prompt now receives authorLocation,             │
│  detectedLanguage, and communityName as input           │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 3: Keyword Regex Fallback (geo-fallback.ts)   │
│  Runs when AI returns null or "Others"                  │
│  Checks: authorLocation → language → source → text      │
├─────────────────────────────────────────────────────────┤
│  PRIORITY 4: "Others" (true last resort)                │
│  Only when all layers find zero signals                 │
└─────────────────────────────────────────────────────────┘
```

#### Layer 2: AI Classification

The AI qualifier (`lib/ai-lead-qualifier.ts`) sends all available data to **Google Gemini** with a system prompt that instructs it to detect geographic origin using this priority:

| Priority | Signal Type          | Examples                                          |
| -------- | -------------------- | ------------------------------------------------- |
| 1        | Author Location      | "Manila, Philippines", "San Francisco, CA"         |
| 2        | Explicit mentions    | "US-based", "from the Philippines", "UK company"  |
| 3        | Community/Group name | "PH Freelancers", "Australian VA Community"        |
| 4        | Post Language        | `tl` (Tagalog) → Philippines, `hi` (Hindi) → India|
| 5        | Timezone/currency    | "PST hours", "$", "£", "€"                        |
| 6        | Language/spelling    | "colour" → UK/AU, "color" → US                    |
| 7        | Cultural context     | Local holidays, regional slang                     |

#### Layer 3: Keyword Regex Fallback

When AI is unavailable or returns "Others", the `inferLocationFromText()` function in `lib/geo-fallback.ts` runs a deterministic check:

1. **Author location string** — regex match against known cities/countries
2. **Language code mapping** — `tl`/`fil` → Philippines, `hi`/`ta`/`te` → India, etc.
3. **Community/source name** — regex match against group/subreddit names
4. **Post text** — regex match against country names, cities, and cultural keywords

Patterns include:
- **Philippines**: `philippines`, `filipino`, `pinoy`, `manila`, `cebu`, `davao`, `tagalog`
- **India**: `india`, `mumbai`, `delhi`, `bangalore`, `hyderabad`, `hindi`
- **United Kingdom**: `uk`, `british`, `london`, `manchester`, `england`, `scotland`
- **Australia**: `australia`, `aussie`, `sydney`, `melbourne`, `brisbane`
- **United States**: `usa`, `american`, `new york`, `california`, `texas`, `florida`

### Step 3: Storage

The resolved location is stored in the `leads` table in Supabase:
- `location` column — one of: `"Philippines"`, `"India"`, `"United States"`, `"United Kingdom"`, `"Australia"`, `"Others"`
- `ai_qualification` column (JSONB) — full AI response including location

### Step 4: Aggregation

The `getGeographyData()` function in `lib/leads.ts`:

1. Queries all leads with a non-null `location`
2. Counts total leads per country
3. Counts "High" intent leads per country
4. Calculates percentage of total

Returns an array of `GeographyDataPoint`:
```typescript
{
  country: string;      // "Philippines", "India", etc.
  code: string;         // "PH", "IN", "US", "GB", "AU", "OT"
  leads: number;        // Total leads from this country
  highIntent: number;   // Leads with intent_level = "High"
  percentage: number;   // % of total leads
}
```

### Step 5: API Endpoint

```
GET /api/dashboard/geography
```

Returns the aggregated `GeographyDataPoint[]` array, always in fixed order: PH → IN → US → GB → AU → OT.

### Step 6: Frontend Display

The `GeographyChart` component (`components/geography-chart.tsx`) renders in two variants:

| Variant       | Used In   | Display                                      |
| ------------- | --------- | -------------------------------------------- |
| `"bar"`       | Dashboard | Horizontal bar chart (Recharts) with tooltips |
| `"breakdown"` | Reports   | Compact list with percentage bars             |

If the API returns empty data, mock data is used as a fallback.

---

## Key Files

| File | Purpose |
| ---- | ------- |
| `extension/src/types.ts` | `ExtractedPost` type — includes `authorLocation` and `detectedLanguage` |
| `extension/src/content-scripts/facebook.ts` | Extracts author location from profile cards + group name |
| `extension/src/content-scripts/linkedin.ts` | Extracts author location from subtitle + LinkedIn Group name |
| `extension/src/content-scripts/reddit.ts` | Extracts user flair as location hint |
| `extension/src/content-scripts/x.ts` | Extracts tweet `lang` attribute + bio location + X Community name |
| `lib/ai-lead-qualifier.ts` | AI prompt with geographic detection (receives metadata) |
| `lib/geo-fallback.ts` | Keyword regex fallback — `inferLocationFromText()` |
| `lib/leads.ts` | `getGeographyData()` — aggregation logic and target countries config |
| `app/api/dashboard/geography/route.ts` | Geography API endpoint |
| `app/api/leads/process/route.ts` | Single lead processing — uses AI + geo fallback |
| `app/api/leads/batch/route.ts` | Batch lead processing — uses AI + geo fallback |
| `components/geography-chart.tsx` | Chart component (bar + breakdown variants) |

---

## AI Model & Rate Limiting

- **Provider**: Google Gemini (free tier)
- **Models**: `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`
- **Rate limit**: 5 calls/min per model
- **Strategy**: Model rotation — when one model is rate-limited, switches to the next with a 60s cooldown
- **Batch processing**: 5 leads per chunk with 1.5s delays between chunks

---

## Fallback Chain Summary

| Scenario | What Happens |
| -------- | ------------ |
| Extension captures author location | Passed to AI prompt + used in regex fallback (highest priority) |
| AI classifies with confidence | Location stored directly |
| AI returns "Others" or null | Keyword regex fallback runs against all available signals |
| Regex fallback finds a match | Overrides "Others" with the matched country |
| All layers find no signals | Location stored as "Others" (or null if AI was fully unavailable) |
| All Gemini models rate-limited | Falls back to keyword scoring (no AI); geo-fallback still runs |
| API returns empty geography data | Frontend falls back to mock data |
| Database error | 500 response, logged to console |

---

## Language Code → Country Mapping

Used by the keyword fallback when X provides a `lang` attribute:

| Language Code | Language | Country |
| ------------- | -------- | ------- |
| `tl`          | Tagalog  | Philippines |
| `fil`         | Filipino | Philippines |
| `ceb`         | Cebuano  | Philippines |
| `hi`          | Hindi    | India |
| `ta`          | Tamil    | India |
| `te`          | Telugu   | India |
| `mr`          | Marathi  | India |
| `bn`          | Bengali  | India |
| `gu`          | Gujarati | India |
| `kn`          | Kannada  | India |
| `ml`          | Malayalam| India |
| `pa`          | Punjabi  | India |
