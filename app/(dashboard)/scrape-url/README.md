# Scrape URL — Scheduler & Scrape Now

This section of Signal Desk AI lets you extract leads from social media posts, either on-demand or on a recurring schedule.

---

## Architecture Overview

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────────────┐
│   Frontend    │──────▶│  Next.js API      │──────▶│  Scraper Service    │
│  /scrape-url  │◀──────│  /api/leads/...   │◀──────│  localhost:4000     │
│               │       │  /api/schedules/  │       │                     │
└──────────────┘       └──────────────────┘       │  ┌───────────────┐  │
                                                   │  │ Playwright    │  │
                                                   │  │ (browser)     │  │
                                                   │  └───────────────┘  │
                                                   │  ┌───────────────┐  │
                                                   │  │ node-cron     │  │
                                                   │  │ (scheduler)   │  │
                                                   │  └───────────────┘  │
                                                   └────────┬────────────┘
                                                            │
                                                   ┌────────▼────────────┐
                                                   │  Supabase (leads,   │
                                                   │  sessions, posts)   │
                                                   └─────────────────────┘
```

The page has three tabs: **Scrape Now**, **Schedules**, and **Run History**.

---

## Scrape Now

Immediately scrape one or more URLs and extract leads.

### How it works

1. **User enters URLs** in the input fields. The platform (Facebook, LinkedIn, Reddit, X) is auto-detected from the URL.
2. **Frontend validates** the URLs and sends a `POST /api/leads/scrape-url` with `{ urls: string[] }`.
3. **Next.js API route** (`app/api/leads/scrape-url/route.ts`) proxies the request to the scraper service at `POST /api/scrape-url`.
4. **Scraper service** (`scraper-service/src/index.ts`) processes each URL:
   - Detects the platform
   - Launches a Playwright browser with the appropriate scraper
   - Extracts posts (see [Platform Scrapers](#platform-scrapers) below)
   - Filters posts (removes job seekers, too-short posts, duplicates)
   - Sends valid posts to the backend via `POST /api/leads/batch`
5. **Backend batch API** deduplicates by URL, scores intent level, and inserts into the `leads` table.
6. **API route logs** the session to `scrape_url_sessions` and each post to `scraped_posts` in Supabase.
7. **Frontend displays** results: total posts found, leads inserted, and duplicates.

### Request flow

```
User clicks "Scrape Now"
  → POST /api/leads/scrape-url  (Next.js)
    → POST /api/scrape-url      (Scraper Service)
      → scrapeUrl(url)           (platform-specific extraction)
      → filterPosts(posts)       (cleanup & dedup)
      → sendLeadsBatch(posts)    (→ POST /api/leads/batch)
    ← UrlScrapeItemResult[]
  ← logs session + posts to Supabase
← { totalPostsFound, totalInserted, totalDuplicates, items }
```

---

## Scheduled Scraping

Automatically scrape URLs on a recurring cron schedule.

### How it works

1. **User creates a schedule** from the Schedules tab: enters a name, one or more URLs, and picks a frequency (preset or custom cron expression).
2. **Frontend sends** `POST /api/schedules` → proxied to the scraper service.
3. **Scraper service** (`scraper-service/src/scheduler/urlScheduler.ts`):
   - Validates the cron expression
   - Persists the schedule to **Supabase** (`url_schedules` table) when configured, or falls back to local JSON files
   - Registers a `node-cron` task in an in-memory map (`activeTasks`)
4. **When the cron fires**, `runSchedule(id)` executes:
   - Acquires a **concurrent execution lock** (prevents overlapping runs for the same schedule)
   - Checks **per-platform rate limits** (e.g. Facebook: 5 min gap between scrapes)
   - Creates a `ScheduleRun` record (status: `running`)
   - Calls `scrapeUrl(schedule.url)` with **automatic retry** (1 retry after 30s backoff on failure)
   - Filters and sends leads to the backend
   - Updates the run record with results (`ok` or `error`)
   - Updates the schedule's `lastRunAt`, `lastRunStatus`, `totalRuns`
   - Tracks **session health** — if 3+ consecutive runs return 0 posts, sends a Discord alert warning about possible expired cookies
   - Sends Discord alerts if configured
   - Persists run history to Supabase or JSON files

### Schedule management

| Action       | Endpoint                          | Description                         |
| ------------ | --------------------------------- | ----------------------------------- |
| List         | `GET /api/schedules`              | All schedules                       |
| Create       | `POST /api/schedules`             | New schedule with name, url, cron   |
| Update       | `PATCH /api/schedules/:id`        | Edit name, url, cron, or status     |
| Delete       | `DELETE /api/schedules/:id`       | Remove schedule and stop cron task  |
| Pause        | `POST /api/schedules/:id/pause`   | Stop cron without deleting          |
| Resume       | `POST /api/schedules/:id/resume`  | Restart cron                        |
| Run Now      | `POST /api/schedules/:id/run`     | Trigger immediate execution         |

### Cron presets

The UI offers common presets via a cron expression builder (`_components/shared.ts`):

- Every 15 / 30 minutes
- Every 1 / 2 / 6 / 12 hours
- Daily at 9 AM
- Custom (raw cron or builder with minute/hour/day/week options)

### Data model

```typescript
// Schedule (persisted to Supabase url_schedules table, or JSON fallback)
{
  id: string;
  name: string;
  url: string;
  cron: string;           // e.g. "*/30 * * * *"
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: "ok" | "error" | null;
  totalRuns: number;
}

// Run record (persisted to Supabase url_schedule_runs table, or JSON fallback — last 200/500 kept)
{
  id: string;
  scheduleId: string;
  scheduleName: string;
  startedAt: string;
  finishedAt: string | null;
  status: "ok" | "error" | "running";
  postsFound: number;
  leadsInserted: number;
  errorMessage: string | null;
  scrapedPosts?: RunScrapedPost[];   // Individual posts found (stored as JSONB)
}

// Individual post captured during a run
{
  author: string;
  text: string;          // Truncated to 200 chars
  url: string;
  platform: Platform;
  timestamp: string;
  matchedKeywords: string[];  // Keywords from the scoring engine
}
```

---

## Run History

The third tab shows execution history across all schedules with real-time monitoring.

### Live progress tracking

When a group of URLs is being scraped sequentially (e.g. 10 Facebook group URLs), a **progress banner** appears at the top of the Run History panel:

```
┌──────────────────────────────────────────────────────────────┐
│  ⟳  Scraping in progress — VA Groups           URL 3 of 10  │
│     Currently scraping: facebook.com/groups/hiring-vas       │
│     ████████░░░░░░░░░░░░  3 of 10 URLs completed            │
└──────────────────────────────────────────────────────────────┘
```

**How it works:**
1. Each URL in a group creates its own run record with `status: "running"` before scraping begins
2. The frontend **polls every 5 seconds** (auto-poll on the Runs tab) to pick up status changes
3. The progress banner calculates position by comparing running vs completed runs within a 10-minute batch window
4. Schedule list items also highlight the actively running URL using run history data (not just the single `runningId` prop)

### Expandable scraped posts per run

Each successful run entry shows a clickable **"N posts found"** link. Clicking it expands an inline panel listing every post discovered during that run:

```
✓  VA Groups (#3)  [Facebook]  — Success
   Today 14:23  ·  42s  ·  📄 34 posts found  ·  +12 leads
   ┌─────────────────────────────────────────────────────┐
   │  Posts Found (34)                                   │
   │  1.  👤 John Smith  [Facebook]                      │
   │      Looking for a VA to handle my Shopify store... │
   │      🏷 hiring va  shopify  virtual assistant       │
   │      🔗 facebook.com/groups/123/posts/456           │
   │  2.  👤 Jane Doe  [Facebook]                        │
   │      Need someone to manage my emails and calendar  │
   │      ...                                            │
   └─────────────────────────────────────────────────────┘
```

Each post shows:
- **Author** and platform badge
- **Text preview** (first 200 characters, 2-line clamp)
- **Matched keywords** as colored chips (from the scoring engine)
- **Post URL** as a clickable link (opens in browser or Tauri shell)

**Data flow:**
1. When `urlScheduler.ts` runs a schedule, it captures filtered posts after `filterPosts()` and enriches them with matched keywords from `sendLeadsBatch()` results
2. Posts are stored as JSONB in the `scraped_posts` column on `url_schedule_runs` (Supabase) or in the JSON fallback file
3. The runs API returns `scrapedPosts[]` with each run record
4. The frontend renders an expandable list with scroll (max 288px height)

### Error alerts

Failed runs are highlighted with prominent error styling:

- **Red left border** on the run entry row + rose-tinted background
- **AlertTriangle icon** with "Scrape failed" label in the stats row
- **Full error message** displayed in a rose-colored detail block below the run metadata (not truncated)
- **Recent failure banner** — when no runs are active, failed runs from the last 10 minutes appear as alert cards at the top of the Run History panel with the schedule name, URL, and full error message

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Scrape failed   VA Groups (#5)       Today 14:28        │
│     facebook.com/groups/va-hiring-hub                        │
│     page.goto: Timeout 30000ms exceeded; requires login      │
└──────────────────────────────────────────────────────────────┘
```

### Standard run info

- Status badge (ok / error / running) with color-coded borders
- Start timestamp, duration in seconds
- Posts found count and leads inserted
- Filter by schedule, refresh, or clear all history

**Endpoints:**
- `GET /api/schedules/runs` — all runs (optional `?scheduleId=` filter), includes `scrapedPosts`
- `DELETE /api/schedules/runs` — clear history

---

## Platform Scrapers

Located in `scraper-service/src/scrapers/`:

| Platform | File                   | Strategy                                                                  |
| -------- | ---------------------- | ------------------------------------------------------------------------- |
| Facebook | `facebookScraper.ts`   | Intercepts GraphQL (`/api/graphql`) responses, falls back to DOM parsing  |
| LinkedIn | `linkedinScraper.ts`   | GraphQL + DOM extraction                                                  |
| Reddit   | `redditScraper.ts`     | Feed extraction from subreddit pages                                      |
| X        | `xScraper.ts`          | Timeline/profile tweet extraction                                         |
| Other    | `urlScraper.ts`        | Generic page scraping                                                     |

The universal entry point is `scrapeUrl(url)` in `urlScraper.ts`, which auto-detects the platform and delegates to the right scraper.

---

## Post Filtering

`scraper-service/src/utils/postFilter.ts` applies these filters before any post becomes a lead:

1. **Minimum length** — configurable per platform (default: 20 chars, X/Twitter: 10 chars). Set via `MIN_POST_LENGTH_<PLATFORM>` env vars.
2. **Job seeker removal** — regex patterns match self-promotion posts ("I'm a virtual assistant", "hire me", etc.) plus dynamic negative keywords fetched from `/api/keywords/search-queries`
3. **Deduplication** — normalized URLs (stripped of query params and trailing slashes) prevent duplicates within the same run
4. **Cross-run deduplication** — the `leads` table has a unique index on `url`, preventing duplicates across runs

---

## Database Tables (Supabase)

| Table                 | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `leads`               | Scored leads with intent level and keywords            |
| `scrape_url_sessions` | Log of each scrape execution (manual or scheduled)     |
| `scraped_posts`       | Individual posts found, linked to session and lead     |
| `url_schedules`       | Durable schedule persistence (replaces JSON files)     |
| `url_schedule_runs`   | Durable run history with scraped posts JSONB (auto-trimmed to last 500 per schedule) |

To enable Supabase persistence for schedules, set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the scraper service `.env`. Run these migrations in the SQL Editor:
1. `supabase/url_schedules.sql` — creates tables and auto-trim trigger
2. `supabase/add_scraped_posts_to_runs.sql` — adds `scraped_posts` JSONB column

Without these env vars, the system falls back to local JSON files.

---

## Key Files

```
app/(dashboard)/scrape-url/
├── page.tsx                          # Main page with 3 tabs
├── _components/
│   ├── scrape-now-tab.tsx            # Manual scrape UI
│   ├── schedules-tab.tsx             # Schedule CRUD UI
│   ├── run-history-tab.tsx           # Run history + progress tracking + post list + error alerts
│   ├── url-result-row.tsx            # Expandable URL result row (used in Scrape Now)
│   └── shared.ts                     # Types (ScheduleRun, RunScrapedPost), cron builder, utilities

app/api/
├── leads/scrape-url/route.ts        # Proxies scrape requests
├── schedules/route.ts               # List/create schedules
├── schedules/[id]/route.ts          # Get/update/delete schedule
├── schedules/[id]/[action]/route.ts # Pause/resume/run actions
└── schedules/runs/route.ts          # Run history

scraper-service/src/
├── index.ts                          # Express server, /api/scrape-url endpoint
├── scrapers/
│   ├── urlScraper.ts                 # Platform detection + universal entry point
│   ├── facebookScraper.ts            # Facebook GraphQL/DOM extraction
│   ├── linkedinScraper.ts            # LinkedIn extraction
│   ├── redditScraper.ts              # Reddit extraction
│   └── xScraper.ts                   # X/Twitter extraction
├── scheduler/
│   ├── urlScheduler.ts               # Schedule CRUD + cron task management
│   └── cronJobs.ts                   # Platform-wide cron jobs
├── utils/
│   ├── postFilter.ts                 # Post filtering and deduplication
│   └── rateLimiter.ts                # Per-platform rate limiting
├── api/
│   └── backendClient.ts              # sendLeadsBatch + TTL keyword cache
├── db/
│   ├── supabase.ts                   # Supabase client (lazy init)
│   └── schedulePersistence.ts        # Supabase/JSON dual persistence layer
└── storage/
    ├── url-schedules.json            # Persisted schedules (JSON fallback)
    └── url-schedule-runs.json        # Persisted run history (JSON fallback)
```

---

## Resilience & Safety Features

| Feature                        | Description                                                               | Config env var                    |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------------- |
| **Retry with backoff**         | Failed scrapes retry once after 30s (configurable)                        | `SCRAPE_RETRY_ATTEMPTS`, `SCRAPE_RETRY_DELAY_MS` |
| **Concurrent execution lock**  | Prevents the same schedule from running twice simultaneously              | _(automatic)_                     |
| **Per-platform rate limiting** | Enforces minimum gaps between scrapes per platform (e.g. Facebook: 5 min) | `RATE_LIMIT_<PLATFORM>_MS`        |
| **Keyword cache TTL**          | Avoids hammering the keywords API during burst scraping (default: 5 min)  | `KEYWORD_CACHE_TTL_MS`            |
| **Session health monitoring**  | Discord alert after N consecutive runs return 0 posts (default: 3)        | `SESSION_HEALTH_THRESHOLD`        |
| **Configurable post length**   | Per-platform minimum post character length (X defaults to 10, others 20)  | `MIN_POST_LENGTH_<PLATFORM>`      |
| **Durable persistence**        | Supabase tables for schedules/runs (falls back to JSON files)             | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Scraped post storage**       | Each run stores its posts as JSONB for later inspection in the UI         | _(automatic)_                     |
| **Real-time run polling**      | Run History tab polls every 5s for live progress during active scrapes    | _(automatic)_                     |
| **Group run progress**         | Visual progress bar + URL counter during sequential multi-URL runs        | _(automatic)_                     |
| **Error alert banners**        | Recent failures (<10 min) shown as prominent alert cards at top of panel  | _(automatic)_                     |
