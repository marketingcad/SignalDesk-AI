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
}
```

---

## Run History

The third tab shows execution history across all schedules:

- Status badge (ok / error / running)
- Start and finish timestamps
- Posts found and leads inserted
- Error messages (if any)
- Can filter by schedule, export to CSV, or clear all history
- Shows countdown to the next scheduled run

**Endpoints:**
- `GET /api/schedules/runs` — all runs (optional `?scheduleId=` filter)
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
| `url_schedule_runs`   | Durable run history (auto-trimmed to last 500 per schedule) |

To enable Supabase persistence for schedules, set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the scraper service `.env`. Run `supabase/url_schedules.sql` in the SQL Editor first. Without these vars, the system falls back to local JSON files.

---

## Key Files

```
app/(dashboard)/scrape-url/
├── page.tsx                          # Main page with 3 tabs
├── _components/
│   ├── scrape-now-tab.tsx            # Manual scrape UI
│   ├── schedules-tab.tsx             # Schedule CRUD UI
│   ├── run-history-tab.tsx           # Run history display
│   └── shared.ts                     # Types, cron builder, utilities

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
