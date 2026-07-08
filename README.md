# Signal Desk AI

Lead intelligence dashboard for **Virtual Assistant hiring detection**. Scrapes social media posts from Facebook, LinkedIn, Reddit, and X, scores them by VA hiring intent using AI + keyword analysis, and alerts you on Discord when qualified leads are detected.

---

---


## Architecture Overview

```
              +---------------------+     +---------------------+
              |  Scrape URL page    |     |  Scheduled jobs     |
              |  (paste URLs, on-   |     |  (node-cron,        |
              |   demand scraping)  |     |   automatic)        |
              +----------+----------+     +----------+----------+
                         |                           |
                         +-------------+-------------+
                                       | drives
                                       v
                            +-------------------+
                            |  Scraper Service  |
                            |  (Playwright +    |
                            |   Crawlee + Cron) |
                            +--------+----------+
                                     | POST /api/leads/batch
                                     v
                            +-------------------+
                            |  Next.js Backend  |
                            |  (API Routes)     |
                            +--------+----------+
                                     |
                        +------------+------------+
                        |            |             |
                        v            v             v
                  +---------+  +---------+  +------------+
                  |Supabase |  | Discord |  | Google     |
                  |(Postgres)| | Webhook |  | Gemini AI  |
                  +---------+  +---------+  +------------+
```

---

## How It Works

### End-to-End Pipeline

1. **Scrape** — Posts are collected from Facebook groups, Reddit subreddits, LinkedIn, and X by the **Scraper Service** (Playwright + Crawlee), driven two ways:
   - **Scrape URL page** — paste one or more URLs in the app for on-demand scraping
   - **Scheduled jobs** — Playwright + Crawlee crawlers run automatically on a cron schedule
2. **Date filter** — Only posts from the **last 7 days** (rolling window) are kept; older posts are discarded
3. **Pre-filter** — Self-promotion and job-seeking posts are rejected using **negative keywords from Settings** before they reach the backend
4. **Keyword gate** — Posts must match at least one **positive keyword from Settings** (high_intent or medium_intent) to be processed. Posts with no keyword match are skipped entirely and never appear in the dashboard
5. **Score** — Every qualifying post is scored (0-100) by a weighted keyword engine in [`lib/intent-scoring.ts`](lib/intent-scoring.ts), using **user-customizable keywords from the Settings page** (stored in Supabase), optionally enhanced by Google Gemini AI analysis via [`lib/ai-lead-qualifier.ts`](lib/ai-lead-qualifier.ts)
6. **Deduplicate** — Posts are deduplicated by URL and content hash to prevent duplicates across sources
7. **Store** — Leads are saved to Supabase with score, category, matched keywords, and AI qualification data
8. **Alert** — Leads scoring **>= 65** trigger a Discord notification (with matched keywords shown) via the Smart Alert Engine in [`lib/alert-engine.ts`](lib/alert-engine.ts)
9. **Dashboard** — Real-time analytics with filtering, charts, lead management, and bulk mark/delete

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| Auth | bcryptjs (password hashing), jose (JWT signing, 7-day sessions) |
| Scraping | Playwright + Crawlee (scraper-service) |
| Scheduling | node-cron (scraper-service) |
| Notifications | Discord Webhooks, Nodemailer (email) |
| AI | Google Generative AI (Gemini) for lead qualification |
| Desktop App | Tauri v2 (Rust), auto-updater, NSIS/MSI/DMG/AppImage |
| CI/CD | GitHub Actions (multi-OS matrix builds + GitHub Releases) |
| UI Components | Radix UI, Shadcn/ui, Lucide icons |

---

## Project Structure

```
signal-desk-ai/
├── app/                    # Next.js app directory
│   ├── (auth)/             # Login, forgot/reset password pages
│   ├── (dashboard)/        # Dashboard, leads, alerts, reports, settings, users
│   └── api/                # API routes (auth, leads, alerts, dashboard, admin)
├── components/             # React components (sidebar, charts, badges, etc.)
├── lib/                    # Core logic (scoring, auth, alerts, AI, DB queries)
├── hooks/                  # Custom React hooks (realtime subscriptions, API fetcher)
├── scraper-service/        # Standalone Playwright + Crawlee scraper (node-cron)
├── src-tauri/              # Tauri desktop app shell (Rust)
│   ├── src/main.rs         # Spawns Next.js + scraper, manages lifecycle
│   ├── tauri.conf.json     # Window, updater, CSP, bundle config
│   └── capabilities/       # Tauri permission capabilities
├── docs/                   # Scraping guide and best practices
├── .github/workflows/      # CI/CD (release.yml — multi-OS builds)
├── supabase/               # Database migrations and schema
├── scripts/                # Utility scripts (setup, token generation)
└── public/                 # Static assets
```

---

## Data Collection Sources

### 1. Scrape URL page (on-demand)

The primary, in-app entry point. Paste one or more post/group/profile URLs on the **Scrape URL** page and the Scraper Service fetches them on demand:

- **Supported sites:** Facebook groups, LinkedIn feed/groups, Reddit subreddits, X home/search (platform auto-detected from the URL)
- **How it works:**
  1. The page submits URLs to `POST /api/leads/scrape-url`, which proxies to the Scraper Service
  2. The service opens each URL with Playwright (using the saved login session where required)
  3. Extracts author, text, URL, and engagement, then applies the keyword gate + scoring
  4. Sends qualifying posts to `POST /api/leads/batch`
- **History:** Each run is logged (sessions + scraped posts) and viewable in the app

### 2. Scraper Service (Scheduled, self-hosted)

A standalone Node.js service using Playwright and Crawlee for automated headless scraping:

- **Scheduling:** Cron-based via `node-cron` + per-URL custom schedules
- **Delivery:** Sends scraped leads to `POST /api/leads/batch`
- **Keywords:** Fetches user keywords from `/api/keywords/search-queries` before every run (force-refreshed)
- **Date filter:** Rolling 7-day window — only posts from the last 7 days are kept
- **Discord summaries:** Posts a scrape cycle summary after every run

#### Per-Platform Scraping Methods

| Platform | Cron Default | Method | Login Required |
|----------|-------------|--------|----------------|
| **Facebook** | Every 2h | GraphQL interception + DOM fallback; Google dorks for search | Yes (private groups) |
| **Reddit** | Every 1h | Subreddit keyword search via `www.reddit.com` + JSON API fallback | No |
| **LinkedIn** | Every 6h | Google dorks (`site:linkedin.com/posts`) + Voyager API interception | Recommended |
| **X (Twitter)** | Every 2h | Google dorks (`site:x.com`) + DOM extraction | No |

#### Default Target Subreddits

Business owner communities where hiring happens (not VA communities):
`r/entrepreneur`, `r/smallbusiness`, `r/ecommerce`, `r/startups`, `r/SaaS`, `r/realestateinvesting`, `r/dropship`, `r/FulfillmentByAmazon`, `r/hiring`, `r/forhire`, `r/virtualassistant`, `r/RemoteWork`, `r/Bookkeeping`, `r/socialmediamarketing`, `r/RealEstate`, `r/DigitalMarketing`

#### LinkedIn Search URLs (VA Hiring Intent)

Pre-built LinkedIn content search URLs filtered to past-week posts, sorted by date:

**High Intent — Direct Hiring**
- [`hiring virtual assistant`](https://www.linkedin.com/search/results/content/?keywords=hiring%20virtual%20assistant&datePosted=past-week&sortBy=date_posted)
- [`need a virtual assistant`](https://www.linkedin.com/search/results/content/?keywords=need%20a%20virtual%20assistant&datePosted=past-week&sortBy=date_posted)
- [`looking for a VA`](https://www.linkedin.com/search/results/content/?keywords=looking%20for%20a%20VA&datePosted=past-week&sortBy=date_posted)
- [`hire a virtual assistant`](https://www.linkedin.com/search/results/content/?keywords=hire%20a%20virtual%20assistant&datePosted=past-week&sortBy=date_posted)
- [`VA needed`](https://www.linkedin.com/search/results/content/?keywords=VA%20needed&datePosted=past-week&sortBy=date_posted)
- [`hiring remote assistant`](https://www.linkedin.com/search/results/content/?keywords=hiring%20remote%20assistant&datePosted=past-week&sortBy=date_posted)
- [`hiring appointment setter`](https://www.linkedin.com/search/results/content/?keywords=hiring%20appointment%20setter&datePosted=past-week&sortBy=date_posted)
- [`hiring executive assistant remote`](https://www.linkedin.com/search/results/content/?keywords=hiring%20executive%20assistant%20remote&datePosted=past-week&sortBy=date_posted)
- [`need admin support remote`](https://www.linkedin.com/search/results/content/?keywords=need%20admin%20support%20remote&datePosted=past-week&sortBy=date_posted)
- [`outsourcing admin work`](https://www.linkedin.com/search/results/content/?keywords=outsourcing%20admin%20work&datePosted=past-week&sortBy=date_posted)

**Medium Intent — Research & Recommendations**
- [`any VA recommendations`](https://www.linkedin.com/search/results/content/?keywords=any%20VA%20recommendations&datePosted=past-week&sortBy=date_posted)
- [`where to hire a virtual assistant`](https://www.linkedin.com/search/results/content/?keywords=where%20to%20hire%20a%20virtual%20assistant&datePosted=past-week&sortBy=date_posted)
- [`should I hire a VA`](https://www.linkedin.com/search/results/content/?keywords=should%20I%20hire%20a%20VA&datePosted=past-week&sortBy=date_posted)
- [`overwhelmed with admin`](https://www.linkedin.com/search/results/content/?keywords=overwhelmed%20with%20admin&datePosted=past-week&sortBy=date_posted)
- [`thinking of hiring a VA`](https://www.linkedin.com/search/results/content/?keywords=thinking%20of%20hiring%20a%20VA&datePosted=past-week&sortBy=date_posted)

**Niche / Tool-Specific (High-Value Leads)**
- [`hiring GoHighLevel VA`](https://www.linkedin.com/search/results/content/?keywords=hiring%20GoHighLevel%20VA&datePosted=past-week&sortBy=date_posted)
- [`hiring social media VA`](https://www.linkedin.com/search/results/content/?keywords=hiring%20social%20media%20VA&datePosted=past-week&sortBy=date_posted)
- [`hiring real estate VA`](https://www.linkedin.com/search/results/content/?keywords=hiring%20real%20estate%20VA&datePosted=past-week&sortBy=date_posted)
- [`hiring bookkeeping VA`](https://www.linkedin.com/search/results/content/?keywords=hiring%20bookkeeping%20VA&datePosted=past-week&sortBy=date_posted)
- [`hiring ecommerce VA`](https://www.linkedin.com/search/results/content/?keywords=hiring%20ecommerce%20VA&datePosted=past-week&sortBy=date_posted)
- [`need VA for Shopify`](https://www.linkedin.com/search/results/content/?keywords=need%20VA%20for%20Shopify&datePosted=past-week&sortBy=date_posted)
- [`need VA for HubSpot`](https://www.linkedin.com/search/results/content/?keywords=need%20VA%20for%20HubSpot&datePosted=past-week&sortBy=date_posted)

**Hashtag Feeds (Broader, Higher Volume)**
- [`#virtualassistant`](https://www.linkedin.com/feed/hashtag/virtualassistant)
- [`#hiringva`](https://www.linkedin.com/feed/hashtag/hiringva)
- [`#remotehiring`](https://www.linkedin.com/feed/hashtag/remotehiring)
- [`#virtualassistantjobs`](https://www.linkedin.com/feed/hashtag/virtualassistantjobs)
- [`#delegatetogrow`](https://www.linkedin.com/feed/hashtag/delegatetogrow)
- [`#hireava`](https://www.linkedin.com/feed/hashtag/hireava)
- [`#outsourcing`](https://www.linkedin.com/feed/hashtag/outsourcing)
- [`#remoteassistant`](https://www.linkedin.com/feed/hashtag/remoteassistant)

#### URL Scheduler (Facebook Groups)

For direct Facebook group scraping, use the **Scrape URL** > **Schedules** tab:
1. Create a schedule group (e.g., "VA Hiring Groups")
2. Add Facebook group URLs (one per field)
3. Set frequency to every 2 hours
4. Enable auto-scrape to run immediately
5. The app processes each URL sequentially with rate limiting

> For detailed scraping strategies, keyword recommendations, and troubleshooting, see the [Scraping Guide](docs/SCRAPING-GUIDE.md).

---

## Dynamic Keywords System

All keywords used throughout the system — for scraping, search queries, Google dorks, scoring, and filtering — are **fully customizable from the Settings page**. Keywords are stored in the Supabase `keywords` table and organized into three categories:

| Category | Score Weight | Purpose |
|----------|-------------|---------|
| **Primary (high_intent)** | +40 | Direct hiring phrases — strongest lead signals |
| **Secondary (medium_intent)** | +20 | Recommendation requests, budget inquiries, delegation signals |
| **Negative** | -40 | Job seekers, self-promotion — reject these posts |

### How Keywords Flow Through the System

```
  /settings page (UI)
        │
        ▼
  Supabase `keywords` table
        │
        ├──► /api/keywords/search-queries ──► Scraper Service
        │         (search queries,              ├─ Google dorks (Facebook, LinkedIn, X)
        │          negative keywords,            ├─ Facebook search URLs
        │          scoring config)               ├─ Reddit search queries
        │                                        ├─ Post keyword matching (high + medium)
        │                                        └─ Negative keyword filtering
        │
        ├──► /api/leads/batch ──► Keyword gate (rejects non-matching posts)
        │                          └─ DynamicScoringConfig (weighted scoring)
        │                              ├─ AI lead qualifier (keyword fallback)
        │                              └─ Intent scoring engine → matched_keywords
        │
        └──► /api/leads/process ──► Keyword gate (same as batch)
                                     └─ Scoring + alert pipeline
```

- **Scraper Service** fetches keywords from `/api/keywords/search-queries` on startup and **before every run** (force-refreshed)
- **URL scraper** uses `scoringConfig.high_intent` + `medium_intent` keywords for in-scraper post matching via `getMatchingKeywords()`
- **Batch and process APIs** enforce a **keyword gate** — posts must match at least one positive keyword from Settings to be inserted
- **Batch processing** builds a `DynamicScoringConfig` from DB keywords for weighted scoring (high=40, medium=20, negative=-40)
- **Matched keywords** are stored in `leads.matched_keywords`, displayed on the Leads page (highlighted in text + chips), and included in Discord notifications
- **Static defaults** in [`lib/keywords.ts`](lib/keywords.ts) are used as fallback when the DB is empty
- Users can **add/remove keywords at any time** from the Settings page — changes take effect on the next scraper run

### Adding/Removing Keywords

1. Navigate to **Settings** → **Keywords**
2. Click **Add** next to any category (Primary, Secondary, Negative)
3. Type a keyword or phrase and press Enter
4. Hover over any keyword chip and click **×** to remove it
5. Changes are saved immediately to Supabase and picked up by the scraper on the next run

---

## Intent Scoring Engine

Every post is scored 0-100 by a weighted keyword engine. The score determines the **intent level** and whether a Discord alert is sent. The scoring engine uses **dynamic keywords from the Settings page** when available, falling back to built-in defaults.

### Intent Levels

| Level | Score Range | Color | Alert? |
|-------|-------------|-------|--------|
| **High** | 80 - 100 | Green (Emerald) | Yes |
| **Medium** | 50 - 79 | Amber | Yes (if >= 65) |
| **Low** | 0 - 49 | Gray | No |

### Score Calculation

The score is the sum of **positive signals**, **negative signals**, and **bonuses**, clamped to 0-100.

#### Positive Signals

| Category | Weight | Example Keywords |
|----------|--------|-----------------|
| Direct Hiring Intent | **+40** | "hiring a virtual assistant", "hire a va", "need a va", "hiring shopify va", "hiring lead generation va" |
| Urgency Boosters | **+20** | "hiring immediately", "urgent va hire", "asap" |
| Recommendation Requests | **+20** | "any va recommendations", "where to find a va", "should i hire a va", "best place to find a va" |
| Budget / Pricing Inquiries | **+20** | "how much does a va cost", "virtual assistant rates" |
| Overwhelm / Delegation Signals | **+15** | "overwhelmed with admin", "drowning in tasks", "need to delegate tasks", "can't keep up with emails" |
| Tool / Skill Triggers | **+15** | "gohighlevel", "hubspot", "zapier", "shopify", "wordpress", "canva", "mailchimp", "amazon fba" |

#### Negative Signals

| Category | Weight | Example Keywords |
|----------|--------|-----------------|
| Job Seeker | **-40** | "i am looking for a va job", "i'm a virtual assistant", "experienced virtual assistant" |
| Self-Promotion | **-30** | "offering va services", "hire me", "available for hire", "accepting new clients", "book a discovery call" |
| DM Solicitation | **-20** | "dm me for", "dm for rates" |

#### Bonuses

| Bonus | Points | Condition |
|-------|--------|-----------|
| Country Match | **+10** | Post mentions US, UK, Australia, or Canada |
| Engagement Boost | **+5** | Post engagement > 5 (likes + comments + shares) |

### AI Lead Qualification

Posts are analyzed by Google Gemini AI via [`lib/ai-lead-qualifier.ts`](lib/ai-lead-qualifier.ts), which evaluates:
- Hiring intent and urgency
- Budget indicators and spam risk
- Tasks/skills the poster needs
- Returns structured qualification data stored as JSONB in the database

**Matched keywords always come from Settings** — the AI provides the score and qualification data, but `matched_keywords` stored on each lead are strictly from your Settings page keywords (never AI-generated labels). Posts that don't match any Settings keyword are never saved.

---

## Authentication

JWT-based session authentication:

1. **Login** — User submits email/password to `POST /api/auth/login`
2. **Verification** — Password compared against bcrypt hash in Supabase `users` table
3. **Session** — JWT token (HS256, 7-day expiry) set as an `httpOnly` cookie
4. **Middleware** — Protected routes check the session cookie on every request (`proxy.ts`)
5. **Service auth** — The Scraper Service authenticates to the backend with a shared `BACKEND_AUTH_TOKEN` Bearer token

### Password Reset Flow
- `POST /api/auth/forgot-password` generates a 1-hour reset token
- User clicks the emailed link
- `POST /api/auth/reset-password` verifies the token and updates the password

---

## API Routes

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Login, returns JWT session cookie |
| POST | `/api/auth/signup` | Create new user (requires auth) |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Confirm reset with token |
| GET | `/api/auth/me` | Get current user profile |
| PATCH | `/api/auth/profile` | Update profile |

### Leads
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/leads` | Fetch leads (filterable by platform, intent, status, date) |
| POST | `/api/leads/process` | Ingest single lead (keyword gate + score + alert) |
| POST | `/api/leads/batch` | Bulk ingest from the Scraper Service (keyword gate + score) |
| POST | `/api/leads/qualify` | AI qualification |
| POST | `/api/leads/scrape-url` | Scrape a URL for posts |
| GET | `/api/leads/scraped-posts` | Manual scrape history |
| DELETE | `/api/leads` | Delete all leads, or bulk delete with `{ ids: string[] }` body |
| DELETE | `/api/leads/:id` | Delete a single lead |

### Dashboard
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/stats` | KPI stats (total, high-intent, avg score, 7-day trend) |
| GET | `/api/dashboard/chart` | Time-series lead counts |
| GET | `/api/dashboard/platform-counts` | Leads by platform breakdown |
| GET | `/api/dashboard/geography` | Leads by country |

### Keywords
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/keywords` | Get keywords grouped by category (DB → static fallback) |
| POST | `/api/keywords` | Add a keyword to a category |
| DELETE | `/api/keywords` | Remove a keyword from a category |
| GET | `/api/keywords/search-queries` | Get keywords formatted for scraper (search queries + scoring config) |

### Webhooks
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/facebook/webhook` | Facebook real-time feed events |

### Admin
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/admin/users` | List / create users |
| GET/PATCH/DELETE | `/api/admin/users/:id` | Manage individual user |

### Schedules
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/schedules` | List / create URL scraping schedules |
| PATCH/DELETE | `/api/schedules/:id` | Update / delete schedule |
| POST | `/api/schedules/:id/pause` | Pause schedule |
| POST | `/api/schedules/:id/resume` | Resume schedule |
| POST | `/api/schedules/:id/run` | Trigger immediate execution |

---

## Discord Notifications

Discord alerts are managed by the **Smart Alert Engine** in [`lib/alert-engine.ts`](lib/alert-engine.ts). Notifications are sent for leads scoring **>= 65**.

### All Conditions Required

| # | Condition |
|---|-----------|
| 1 | `DISCORD_WEBHOOK_URL` env variable is set |
| 2 | `discord_enabled` is `true` in Dashboard Settings |
| 3 | Lead intent score **>= 65** |
| 4 | Not a duplicate (same author + platform not alerted in last 2 hrs) |
| 5 | Within rate limit (max 10 Discord messages/hour) |
| 6 | Outside cooldown (min 5 min between batch sends) |

**If any condition fails, no notification is sent.**

### Rate Limiting & Batching

| Setting | Default | Description |
|---------|---------|-------------|
| Batch Window | 60 sec | Alerts collected for 60s before sending |
| Max Alerts / Hour | 10 | Hard cap on Discord messages per hour |
| Cooldown | 5 min | Minimum gap between consecutive sends |
| Dedup Window | 2 hours | Same author+platform ignored within window |
| Digest Threshold | 3 leads | 3+ pending leads triggers a combined digest |

### Notification Sources

| Source | Trigger |
|--------|---------|
| Scraper Service | Scheduled or on-demand (Scrape URL) scrape finds leads scoring >= 65 |
| Facebook Webhook | Real-time Facebook feed event classified |
| Manual Upload | Single lead submitted via API |

### Notification Content

Each Discord notification embed includes:
- Author name, platform, and intent score with visual score bar
- Post text preview (400 chars, smart-truncated)
- Intent category and level
- **Matched keywords** from Settings displayed as inline code chips
- Direct link to the original post

---

## Dashboard Pages

| Page | Description |
|------|-------------|
| **Dashboard** | KPI cards, lead trend chart, platform distribution, high-intent previews |
| **Leads** | Card + table views with filtering, keyword highlighting, mark/unmark selection mode for bulk deletion |
| **Alerts** | Real-time high-intent alerts feed |
| **Reports** | Daily/weekly lead reporting |
| **Scrape URL** | Manual URL scraping with schedules, live run progress tracking, expandable post lists per run, and error alerts |
| **Settings** | Platform toggles, **customizable keywords** (primary/secondary/negative), alert threshold, scoring rules |
| **Users** | User management (admin only) |

---

## Leads Page Features

### Card & Table Views
Switch between card grid and table list layouts. Both support resizable split-panel with a detail view on the right.

### Keyword Highlighting
Matched keywords from Settings are displayed as colored chips on each lead and **highlighted in the post text** for quick scanning.

### Mark & Delete (Selection Mode)
Bulk lead management via the **Action** dropdown:

1. Click **Action** → **Mark for Deletion** to enter selection mode
2. **Checkboxes appear** on every card (top-right corner) and table row (left column)
3. Click individual leads to toggle selection, or use:
   - **Mark All** — selects all visible leads on the current page
   - **Unmark All** — deselects everything
4. Click **Delete N leads** to permanently remove selected leads (with confirmation)
5. Click **Exit** to leave selection mode without deleting

In table view, the header checkbox toggles between select-all, select-none, and shows a partial-selection indicator.

### Export
Export filtered leads to CSV with all fields (username, platform, score, status, keywords, URL, date).

---

## Scrape URL — Run History

### Live Progress Tracking
During sequential multi-URL scrapes, a **progress banner** shows:
- Schedule name and "URL X of N" counter
- Currently scraping URL
- Animated progress bar
- Auto-polls every 5 seconds for real-time updates

### Expandable Post Lists
Each completed run shows a clickable **"N posts found"** link. Expanding it reveals every post with author, text preview, matched keyword chips, and clickable post URL.

### Error Alerts
- Failed runs get a **red left border** and expanded error message block
- Recent failures (< 10 min) appear as prominent alert cards at the top of the panel

---

## Database Schema (Supabase)

### leads
Core table storing all detected leads:
- `id`, `platform`, `source`, `username`, `text`, `url`
- `intent_score`, `intent_level`, `intent_category`, `matched_keywords[]`
- `status` (New, Contacted, Qualified, Dismissed)
- `engagement`, `location`, `detected_at`
- `ai_qualification` (JSONB from Gemini analysis)
- Unique constraint on `url`; indexes on platform, intent, status, score

### keywords
User-customizable keywords managed from the Settings page:
- `id`, `keyword`, `category` (`high_intent`, `medium_intent`, `negative`), `created_at`
- Used by the scraper service for search queries, Google dorks, and post filtering
- Used by the scoring engine via `DynamicScoringConfig` for lead qualification
- Falls back to static defaults in [`lib/keywords.ts`](lib/keywords.ts) when empty

### facebook_post_logs
Audit trail for Facebook webhook events: post_id, author, message, classification, notified flag.

### url_schedules
Durable persistence for per-URL scraping schedules (replaces JSON files when Supabase is configured):
- `id`, `name`, `url`, `cron`, `status` (`active`/`paused`)
- `last_run_at`, `last_run_status`, `total_runs`, `created_at`, `updated_at`

### url_schedule_runs
Execution history for each scheduled run (auto-trimmed to last 500 per schedule):
- `id`, `schedule_id`, `schedule_name`, `started_at`, `finished_at`
- `status` (`ok`/`error`/`running`), `posts_found`, `leads_inserted`, `error_message`
- `scraped_posts` (JSONB) — array of posts found during the run with author, text, URL, platform, timestamp, and matched keywords

### scrape_url_sessions / scraped_posts
Tracks manual URL scraping requests and their results.

### auto_delete_old_leads
Database function to auto-delete leads older than a configurable number of days.

---

## Troubleshooting: Leads But No Discord Notifications?

Check these causes in order:

1. **Most leads score below 65** — Discord only fires for score >= 65. Check your dashboard filters.
2. **`DISCORD_WEBHOOK_URL` is missing or invalid** — Verify in `.env` / `.env.local`.
3. **Discord notifications are disabled in Settings** — Confirm the toggle is ON.
4. **Leads were inserted directly into the database** — Only leads processed through the API routes trigger the alert pipeline.
5. **Deduplication suppressed the alerts** — Same author + platform within 2 hours = only first alert fires.
6. **Rate limit was reached** — 10 messages/hour cap + 5-minute cooldown.

### Quick Diagnostic Checklist
- [ ] Verify `DISCORD_WEBHOOK_URL` is set
- [ ] Verify Discord is enabled on the Settings page
- [ ] Count how many leads score >= 65
- [ ] Test webhook manually: `curl -X POST YOUR_WEBHOOK_URL -H "Content-Type: application/json" -d '{"content": "Test from Signal Desk"}'`

---

## Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth (required)
JWT_SECRET=

# Discord (required for notifications)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN

# Facebook (required for Facebook webhook)
FB_VERIFY_TOKEN=
FB_APP_SECRET=

# Google AI (required for AI qualification)
GOOGLE_API_KEY=

# Email (required for password reset emails)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Services (for scraper-service integration)
SCRAPER_SERVICE_URL=
SCRAPER_SERVICE_AUTH_TOKEN=
```

---

## Getting Started (Web)

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Running the Scraper Service

```bash
cd scraper-service
npm install
npm start
```

### Scraping from the app

1. Open the **Scrape URL** page in the dashboard
2. Paste one or more post / group / profile URLs and run it (on-demand), **or**
3. Create a **Schedule** to scrape those URLs automatically on a cron interval
4. Results flow into the **Leads** and **Alerts** pages

> Authenticated platforms (Facebook, LinkedIn) require a saved login session — set it up via **Settings → Live Login**.

---

## Desktop App (VA Hub)

VA Hub wraps the entire Signal Desk AI platform into a native desktop application using [Tauri v2](https://v2.tauri.app). The app **bundles the entire Next.js server and scraper service** inside the installer — no source code, no `npm install`, no `git clone` needed on user devices.

### How the Bundled Desktop App Works

1. **Build time** — `npm run build` creates a Next.js standalone server. `scripts/prepare-bundle.js` packages the standalone server + scraper dist + node_modules into `bundle.tar.gz`. Tauri includes this archive in the installer.
2. **First launch** — The app extracts `bundle.tar.gz` into the local AppData directory (once per version).
3. **Every launch** — The app runs `node server.js` (Next.js) and `node dist/index.js` (scraper) from the extracted bundle. The dashboard loads from `localhost:3000` inside a native window.
4. **Updates** — When a new version is released, the auto-updater downloads and installs it. On next launch, the new bundle is re-extracted automatically.

Extraction locations:
- **Windows:** `%APPDATA%\com.signaldesk.vahub\server\`
- **macOS:** `~/Library/Application Support/com.signaldesk.vahub/server/`
- **Linux:** `~/.local/share/com.signaldesk.vahub/server/`

### Download & Install

Pre-built installers are published as [GitHub Releases](../../releases). Download the latest version for your OS:

| Platform | File | Install Method |
|----------|------|---------------|
| **Windows** | `VA-Hub_x.x.x_x64-setup.exe` | Double-click → follow installer (NSIS) |
| **Windows** | `VA-Hub_x.x.x_x64_en-US.msi` | Double-click → follow installer (MSI) |
| **macOS (Apple Silicon)** | `VA-Hub_x.x.x_aarch64.dmg` | Open DMG → drag to Applications |
| **macOS (Intel)** | `VA-Hub_x.x.x_x64.dmg` | Open DMG → drag to Applications |
| **Linux** | `VA-Hub_x.x.x_amd64.AppImage` | `chmod +x *.AppImage && ./VA-Hub.AppImage` |
| **Linux** | `VA-Hub_x.x.x_amd64.deb` | `sudo dpkg -i VA-Hub_*.deb` |

### Prerequisites (Per Device)

The only prerequisite is **Node.js 20+** installed on the device:

| OS | Install Node.js |
|----|-----------------|
| **Windows** | Download from https://nodejs.org (LTS recommended) |
| **macOS** | `brew install node` or download from https://nodejs.org |
| **Linux** | `sudo apt install nodejs npm` or use [nvm](https://github.com/nvm-sh/nvm) |

Verify: `node --version` (should show v18+ or v20+)

### First-Time Setup After Installing

1. **Install Node.js** — See prerequisites above.
2. **Launch VA Hub** — Open from Start Menu / Applications / desktop shortcut. The first launch takes ~10-30 seconds to extract the bundled server.
3. **Browser auth for scrapers** — A login prompt appears automatically. Click "Login to All Platforms" to open a browser and log in to your social accounts. Sessions are saved locally.

### Browser Auth (Auto-Login on Launch)

Every time the desktop app starts, a login prompt appears so you can keep your social media sessions fresh. The app checks whether you have existing saved sessions and adapts accordingly:

1. **Login prompt on every launch** — A modal appears with:
   - **"Login to All Platforms"** — Opens a Playwright browser with tabs for Facebook, LinkedIn, and Twitter
   - **Individual platform buttons** — Log in to just one platform
2. **Save & close** — Log in to your accounts in the browser that opens, then close it. Your session cookies are saved automatically.
3. **Skip / Use existing sessions** — If you already have saved sessions, you can click "Use existing sessions" to skip re-login. If no sessions exist, you can click "Skip for now" and log in later via `npm run scraper:auth`.

Your saved sessions persist between app restarts. The prompt appears every launch to give you the option to refresh, but you can always skip if your sessions are still valid.

To re-login at any time:
```bash
npm run scraper:auth                # All platforms
npm run scraper:auth -- facebook    # Just Facebook
npm run scraper:auth -- linkedin    # Just LinkedIn
npm run scraper:auth -- twitter     # Just Twitter
```

### Auto-Updates

VA Hub checks for updates automatically on startup. When a new version is available, a notification appears in the desktop status bar at the bottom of the window:

- Click **"Update to vX.X.X"** to download and install
- The app will restart automatically with the new version
- You can also click **"Check Updates"** manually at any time

### Sharing the App with Others

#### Option A: Share the Installer (Simplest — Recommended)

1. Go to [Releases](../../releases) and download the appropriate installer
2. Send it to the other person (email, file share, USB drive, etc.)
3. They install it like any normal desktop app
4. They only need **Node.js** installed — the server and scraper are bundled in the installer

#### Option B: Build From Source

On the target machine:

```bash
# Prerequisites
# - Node.js 20+
# - Rust (https://rustup.rs)
# - Visual Studio Build Tools (Windows) / Xcode CLI (macOS) / libwebkit2gtk (Linux)

# Clone the repo
git clone https://github.com/YOUR_USERNAME/signal-desk-ai.git
cd signal-desk-ai

# Run automated setup
bash scripts/setup-desktop.sh

# Build the installer
npm run tauri:build
```

The built installer will be in `src-tauri/target/release/bundle/`.

#### Option C: Remote Access via Cloudflare Tunnel

Instead of installing the app on every device, you can run it on one machine and share access remotely:

```bash
# Start the app with Cloudflare Tunnel
./start-local.sh
```

This generates a public URL like `https://abc-xyz.trycloudflare.com` that anyone can access from their browser — no installation needed. The Tauri desktop app also has built-in tunnel controls in the status bar.

### Desktop App Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Launch desktop app in development mode |
| `npm run tauri:build` | Build production installer for your OS |
| `npm run desktop:dev` | Run Next.js + scraper without Tauri window |
| `npm run scraper:auth` | Open browser to log in for scraper cookies |
| `npm run scraper:build` | Build scraper service (TypeScript → JS) |
| `npm run updater:keygen` | Generate signing keys for auto-updates |

### Releasing a New Version

```bash
# 1. Bump version in package.json, src-tauri/tauri.conf.json, AND src-tauri/Cargo.toml
# 2. Commit
git add -A && git commit -m "release: v1.0.1"

# 3. Tag and push
git tag v1.0.1
git push origin main --tags
```

GitHub Actions will automatically:
1. Build installers for Windows, macOS (ARM + Intel), and Linux
2. Sign the update artifacts
3. Generate `latest.json` for the auto-updater
4. Publish everything as a GitHub Release

Existing installations will detect and offer the update within minutes.

### Signing Keys for Auto-Updates

The auto-updater requires a signing key pair so users can trust that updates come from you:

```bash
# Generate keys (one-time)
npm run updater:keygen
```

This creates:
- `src-tauri/keys/updater.key` — **Private key** (never commit, add to GitHub Secrets)
- `src-tauri/keys/updater.key.pub` — **Public key** (paste into `src-tauri/tauri.conf.json`)

Add these GitHub Secrets to your repository:
- `TAURI_SIGNING_PRIVATE_KEY` — entire content of `updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you set during generation

### macOS: Fix "Damaged App" Warning

macOS blocks unsigned apps by default. You may see **"VA Hub is damaged and can't be opened"** or **"should be moved to the Trash"** when trying to open the app. Follow these steps to fix it:

**Step 1 — Remove quarantine from the DMG**

Open **Terminal** and run:

```bash
sudo xattr -cr ~/Downloads/VA\ Hub*.dmg
```

Enter your Mac password when prompted.

**Step 2 — Install the app**

Double-click the `.dmg` file to mount it, then drag **VA Hub** into your **Applications** folder.

**Step 3 — Remove quarantine from the installed app**

Back in Terminal, run:

```bash
sudo xattr -cr /Applications/VA\ Hub.app
```

**Step 4 — Launch VA Hub**

Open **VA Hub** from your Applications folder or Launchpad. The first launch takes ~30-60 seconds while the bundled server is extracted and Playwright browsers are downloaded.

**Step 5 — Install Playwright browsers (if scraping fails)**

If you see "Executable doesn't exist" errors when scraping, run this in Terminal:

```bash
cd ~/Library/Application\ Support/com.signaldesk.vahub/server/scraper
/usr/local/bin/node node_modules/playwright/cli.js install chromium
```

> On Apple Silicon Macs using Homebrew, replace `/usr/local/bin/node` with `/opt/homebrew/bin/node`.

This only needs to be done **once per device**. After that, the app and auto-updates work without these steps.

### Documentation

| Guide | Description |
|-------|-------------|
| [Scraping Guide](docs/SCRAPING-GUIDE.md) | Platform strategies, keyword recommendations, schedule setup, session management, pipeline diagram, troubleshooting |
| [Scrape URL README](app/(dashboard)/scrape-url/README.md) | Technical details for the Scrape URL page: architecture, data flow, API endpoints, schedule management, run history |

### Platform-Specific Requirements

| Platform | Prerequisite |
|----------|-------------|
| **Windows** | [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++". Disable Smart App Control for local builds. |
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Linux** | `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev` |




## Planned: Smart VA Matching (Linkage VA Hub × SignalDesk AI)

> **Status:** Planned — not yet implemented.
> **Goal:** Automatically match leads found by SignalDesk AI to the best-fit VAs in the Linkage directory, and route those leads back into VA Hub to protect revenue, leads require to register in the VA Hub to request a VA as client based on the leads matching.

### The two systems

| | **SignalDesk AI** | **Linkage VA Hub** |
|---|---|---|
| **Role** | Demand — finds businesses needing a VA | Supply — the vetted VA directory |
| **Hosting** | DigitalOcean | Vercel |
| **Database** | Supabase (`us-west-2`) | Supabase (`us-east-1`) |
| **Key data** | `leads` (text, intent_score, location, matched_keywords), `outreach_drafts` | `vas` (skills, tools, bio, availability, slug), `va_service_requests` |
| **Already has** | Scraping, intent scoring, draft generation | pgvector, Gemini embeddings, Claude, rate-limiting |

### Core principle: connect via API, not a shared database

The apps live in **separate Supabase projects in different regions**. Do **not** merge them.

> **VA Hub owns the VA data and exposes matching as a secure service. SignalDesk consumes it.**

Each app keeps its own source of truth, there is no cross-project coupling, there is one securable and rate-limited surface, and the same engine can later power VA Hub's own hiring-request matching and directory search.

### Architecture

```
┌──── SignalDesk AI (DigitalOcean) ──────────────────────┐
│  scraper → lead (text, intent_score, location)          │
│                     │ qualified?                        │
│                     ▼                                   │
│   POST https://vahub…/api/match-vas                     │
│   Authorization: Bearer MATCH_API_SECRET                │
│   { text, location, intentCategory, limit }             │
└─────────────────────┼───────────────────────────────────┘
                      ▼
┌──── Linkage VA Hub (Vercel) ───────────────────────────┐
│  /api/match-vas   [secret auth + rate limit]            │
│    1. embed(text)          → Gemini 768-dim             │
│    2. match_vas() RPC      → pgvector cosine search     │
│    3. hard filters         → active, available, not hired│
│    4. (opt) Claude re-rank → "why this VA fits"         │
│    5. return SAFE fields only  ⚠ no email/phone         │
└─────────────────────┼───────────────────────────────────┘
                      ▼
┌──── SignalDesk AI ─────────────────────────────────────┐
│  store in `lead_va_matches`                             │
│  inject top match into `outreach_drafts.body`:          │
│  "…we have Maria S. (CRM, GHL). Profile: {profileUrl}"  │
└─────────────────────┼───────────────────────────────────┘
                      ▼
        Lead opens profile (no contact shown)
        → "Request this VA" → must REGISTER
        → hiring request on-platform → revenue captured
```

### What to build — VA Hub side

**1. VA embedding index** (new table; leaves `vas` untouched)

```
va_embeddings (va_id PK → vas.id, embedding vector(768), profile_text, updated_at)
```

`profile_text` = skills + software_tools + short_bio + work_experience + years_of_experience + availability + location.

**2. Keep it fresh** — backfill all published VAs once, then re-embed whenever a VA profile is created, updated, or published (hook into the existing VA publish/update actions). *Stale embeddings produce bad matches.*

**3. `match_vas()` RPC** — same shape as the existing `match_kb_documents`: cosine similarity plus **hard filters in SQL** (`is_active`, not Hired, availability vs urgency, engagement type, location).

**4. `POST /api/match-vas`** — the contact point between the apps.

```jsonc
// Request
{ "text": "need a VA to manage my CRM and social media",
  "location": "US", "intentCategory": "hiring", "limit": 3 }

// Response — SAFE FIELDS ONLY
{ "matches": [{
    "slug": "maria-s",
    "firstName": "Maria",
    "headshotUrl": "https://…",
    "skills": ["CRM", "GoHighLevel", "Social Media"],
    "yearsOfExperience": 5,
    "availability": "available-now",
    "profileUrl": "https://vahub…/va/maria-s?src=signaldesk&lead=<id>",
    "matchScore": 0.92,
    "rationale": "Strong CRM + GHL automation background"   // optional (Claude)
}]}
```

> **Never return `email`, `phone`, or `portfolio`.** The `profileUrl` is the only way forward — that is what protects revenue.

### What to build — SignalDesk side

1. **Trigger** — when a lead is qualified (intent score above threshold / VA-related category), call `/api/match-vas` server-side with `lead.text`.
2. **Store** — new table `lead_va_matches (lead_id, va_slug, first_name, profile_url, match_score, rationale)`.
3. **Enrich outreach** — inject the top match and its **profile URL** into `outreach_drafts.body`.

### Security model

| Concern | Control |
|---------|---------|
| Who can call the API | Shared secret `MATCH_API_SECRET` (Bearer), server-to-server only — reject browser origins |
| Abuse / cost | Reuse the existing Upstash rate-limiter on the endpoint |
| VA PII leakage | Response whitelist: slug, first name, headshot, skills, availability, profileUrl |
| **Bypass** | Public profile hides email/phone; "Request this VA" requires client registration |
| **SignalDesk `leads`** | **RLS is currently disabled** — anyone with the anon key can read/modify all leads. Must be fixed. |

### Attribution (proves the ROI)

Append `?src=signaldesk&lead={leadId}` to every `profileUrl`. VA Hub stores it on the resulting client registration / hiring request, making the full funnel measurable:

> **lead → profile click → registration → hiring request → placement → revenue**

### Build phases

| Phase | What | Why |
|-------|------|-----|
| **0** | Hide email/phone on public VA profiles + gate "Request this VA" behind registration. Fix SignalDesk `leads` RLS. | **Blocker — without this the funnel leaks; bypass is trivial today** |
| **1** | `va_embeddings` table + backfill + keep-in-sync | The engine's foundation |
| **2** | `match_vas()` RPC + internal matching function | Ranking logic |
| **3** | `POST /api/match-vas` (secret auth + rate limit + safe fields) | The contact point |
| **4** | SignalDesk: call it, store `lead_va_matches` | Consumer |
| **5** | SignalDesk: inject profile URL into outreach drafts | Revenue path |
| **6** | *(optional)* Claude re-rank + rationale; funnel analytics | Polish + proof |

### Key risks

- **Embedding freshness** — re-embed on profile change, or matches go stale.
- **Hard filters must gate the vector score** — never pitch an inactive, hired, or unavailable VA, no matter how semantically similar.
- **Cross-region latency** — `us-west-2` → `us-east-1` is fine for server-to-server (~50–80ms).
- **Human-in-the-loop** — matches are *suggestions* for the team's outreach, not auto-placement. This fits the managed model.

> **Phase 0 is the blocker.** Everything else builds a funnel that leaks revenue if the public profile keeps exposing VAs' email addresses.

---

Linkage VA Hub - Connecting businesses with vetted Virtual Assistant talent.






# Smart VA Matching — Integration Spec for SignalDesk AI

> **Audience:** developers (or an AI coding agent) working on **SignalDesk AI**.
> **Purpose:** everything needed to call Linkage VA Hub's matching API and use the results.
> **Status:** VA Hub side is **implemented**. SignalDesk side is **not yet built** — this document specifies it.

---

## 1. What this is

**SignalDesk AI** finds businesses that need a Virtual Assistant (*demand*).
**Linkage VA Hub** owns the directory of vetted VAs (*supply*).

Smart VA Matching connects them: SignalDesk sends a lead's text to VA Hub, VA Hub returns the
**best-matching VAs** (ranked semantically), and SignalDesk drops the VA's **public profile link**
into the outreach draft.

The lead can only act on that link by **registering on VA Hub and submitting a hiring request** —
which is how the placement fee is protected.

```
SignalDesk lead (text)
      │  POST /api/match-vas
      ▼
VA Hub: embed text → vector search over VA directory → hard filters → ranked VAs
      │  { matches: [...] }
      ▼
SignalDesk: store matches → inject profileUrl into outreach draft
      ▼
Lead clicks profile → no contact info shown → "Request This VA" → must register
      ▼
Hiring request on-platform → revenue captured
```

---

## 2. How VA Hub matches (so you know what you're getting)

1. Every **active, non-Hired** VA has a "profile text" (skills, software tools, bio, work
   experience, years, availability, location) embedded into a **768-dimension vector**
   (Google Gemini `text-embedding-004`) and stored in `va_embeddings`.
2. On each request, VA Hub embeds your `text` and runs a **cosine-similarity** search
   (Postgres `pgvector`) via the `match_vas()` function.
3. **Hard business filters are applied in SQL**, not by the AI:
   - `is_active = true`
   - `interview_status <> 'Hired'`

   A VA who is inactive or already hired is **never returned**, no matter how similar.
4. Results below a similarity floor (`0.30`) are dropped. You also receive `matchScore` so you
   can filter more strictly on your side.

---

## 3. The API

### Endpoint
```
POST https://vahub.esystemsmanagement.com/api/match-vas
```

### Authentication
Server-to-server only, via a shared secret:
```
Authorization: Bearer <MATCH_API_SECRET>
Content-Type: application/json
```
> ⚠️ **Never put this secret in browser/client code.** Call this endpoint from SignalDesk's
> **backend only**. The comparison is constant-time, so the secret cannot be probed by timing.

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `text` | string | ✅ | The lead's requirement text (e.g. `leads.text`). Max **4000** characters. |
| `limit` | number | — | How many matches to return. **1–10**, default **3**. |
| `leadId` | string | — | Your `leads.id`. Embedded into `profileUrl` for attribution. |
| `source` | string | — | Attribution source. Defaults to `"signaldesk"`. |

```jsonc
{
  "text": "Looking for a virtual assistant to manage my CRM and social media posting",
  "limit": 3,
  "leadId": "8f3c1b0e-...",
  "source": "signaldesk"
}
```

### Success response — `200 OK`

```jsonc
{
  "matches": [
    {
      "slug": "maria-santos",
      "firstName": "Maria",
      "displayName": "Maria S.",
      "headshotUrl": "https://<project>.supabase.co/storage/v1/object/public/va-files/headshots/maria.jpg",
      "skills": ["CRM", "GoHighLevel", "Social Media"],
      "yearsOfExperience": 5,
      "availability": "available-now",
      "profileUrl": "https://vahub.esystemsmanagement.com/va/maria-santos?src=signaldesk&lead=8f3c1b0e-...",
      "matchScore": 0.91
    }
  ]
}
```

`matches` may be an **empty array** — that's a valid result (nothing cleared the floor, or the
directory has no index yet). Handle it gracefully; don't treat it as an error.

#### Field reference

| Field | Type | Meaning |
|-------|------|---------|
| `slug` | string | VA's public profile slug |
| `firstName` | string | First name only |
| `displayName` | string | `"Maria S."` — use this in outreach copy |
| `headshotUrl` | string \| null | Absolute, public image URL |
| `skills` | string[] | VA's skills |
| `yearsOfExperience` | number \| null | Years of experience |
| `availability` | string \| null | `available-now` \| `available-in-two-weeks` \| `available-in-one-months` |
| `profileUrl` | string | **The only call-to-action link. Always use this.** |
| `matchScore` | number | Cosine similarity `0..1`, 2 decimal places |

### 🔒 What the API will never return
`email`, `phone`, `portfolio`, or the VA's **full last name**.

This is deliberate and enforced server-side. The `profileUrl` is the only way for a lead to reach
a VA — that's what prevents clients and VAs from connecting directly and bypassing the platform.
**Do not attempt to obtain or include VA contact details in outreach.**

### Error responses

| Status | Meaning | What to do |
|--------|---------|------------|
| `400` | Invalid JSON, missing/empty `text`, or `text` > 4000 chars | Fix the request; don't retry as-is |
| `401` | Missing or wrong bearer token | Check `MATCH_API_SECRET` |
| `429` | Rate limited | Honor the **`Retry-After`** header (seconds), then retry |
| `502` | Matching failed upstream | Retry with backoff |
| `503` | Matching disabled (`MATCH_API_SECRET` not set on VA Hub) | Contact VA Hub admin |

Error shape: `{ "error": "human readable message" }`

---

## 4. Examples

### cURL
```bash
curl -X POST https://vahub.esystemsmanagement.com/api/match-vas \
  -H "Authorization: Bearer $MATCH_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text":"need a VA to manage my CRM and social media","limit":3,"leadId":"8f3c1b0e"}'
```

### TypeScript (SignalDesk backend)
```ts
export interface VaMatch {
  slug: string;
  firstName: string;
  displayName: string;
  headshotUrl: string | null;
  skills: string[];
  yearsOfExperience: number | null;
  availability: string | null;
  profileUrl: string;
  matchScore: number;
}

export async function matchVAsForLead(
  leadText: string,
  leadId: string,
  limit = 3,
): Promise<VaMatch[]> {
  const res = await fetch(`${process.env.VAHUB_BASE_URL}/api/match-vas`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MATCH_API_SECRET}`, // server-side only
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: leadText, leadId, limit, source: 'signaldesk' }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 60);
    throw new Error(`Rate limited; retry in ${retryAfter}s`);
  }
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`match-vas failed (${res.status}): ${error}`);
  }

  const { matches } = (await res.json()) as { matches: VaMatch[] };
  return matches;
}
```

---

## 5. What to build in SignalDesk

### Step 1 — When to call
Call `matchVAsForLead()` **from the backend** when a lead is qualified — e.g. when
`leads.intent_score` clears your threshold, or `leads.intent_category` indicates VA hiring intent.

Trigger options (pick one):
- Automatically after a lead is inserted/qualified by the scraper pipeline, **or**
- On demand from the lead detail UI ("Find matching VAs").

Use `leads.text` as the `text` field and `leads.id` as `leadId`.

### Step 2 — Store the matches

```sql
create table if not exists lead_va_matches (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  va_slug       text not null,
  display_name  text not null,
  headshot_url  text,
  skills        text[],
  availability  text,
  profile_url   text not null,
  match_score   double precision not null,
  created_at    timestamptz not null default now(),
  unique (lead_id, va_slug)
);

alter table lead_va_matches enable row level security;
-- Add policies matching how SignalDesk reads/writes (service-role only is simplest).
```

Re-running a match for the same lead should **upsert** on `(lead_id, va_slug)`.

### Step 3 — Enrich the outreach draft

When generating `outreach_drafts.body`, inject the **top match**. Always include `profileUrl`;
never include VA contact details.

Template:
```
Hi {lead.username},

Saw your post about needing help with {short summary of lead.text}.

We have {match.displayName} — a vetted VA with {match.skills.slice(0,3).join(', ')}
and {match.yearsOfExperience} years of experience. {availability sentence}

Here's the profile: {match.profileUrl}

— The Linkage VA Hub team
```

Availability sentence mapping:
- `available-now` → "They're available to start now."
- `available-in-two-weeks` → "They can start in about two weeks."
- `available-in-one-months` → "They can start in about a month."

### Step 4 — Attribution
`profileUrl` already carries `?src=signaldesk&lead=<leadId>`. **Preserve those params** — do not
strip or shorten the URL through a redirector that drops the query string. VA Hub uses them to
attribute registrations and hiring requests back to the originating lead, which is how the funnel
is measured:

> lead → profile click → registration → hiring request → placement → revenue

---

## 6. Configuration

### VA Hub side (already done, except the secret + backfill)
| Item | Status |
|------|--------|
| `va_embeddings` table + `match_vas()` function | ✅ Applied to production |
| `POST /api/match-vas` | ✅ Implemented |
| `POST /api/admin/va-index/reindex` | ✅ Implemented |
| `MATCH_API_SECRET` env var (Vercel) | ⬜ **Must be set** |
| Backfill the VA index | ⬜ **Must be run once** |

### SignalDesk side
| Env var | Purpose |
|---------|---------|
| `VAHUB_BASE_URL` | `https://vahub.esystemsmanagement.com` |
| `MATCH_API_SECRET` | Same value as VA Hub's. **Server-side only.** |

---

## 7. Operating the VA index (VA Hub admins)

The index must stay fresh, or matches go stale.

**Backfill the whole directory** (run once, and after bulk changes):
```bash
curl -X POST https://vahub.esystemsmanagement.com/api/admin/va-index/reindex \
  -H "Content-Type: application/json" -d '{}'
# → { "success": true, "indexed": 33, "skipped": 0 }
```

**Reindex a single VA** (call after a VA profile is published or updated):
```bash
curl -X POST https://vahub.esystemsmanagement.com/api/admin/va-index/reindex \
  -H "Content-Type: application/json" -d '{"vaId":"<uuid>"}'
```

> Both require an authenticated **admin session** (the `linkage_admin_session` cookie), so call
> them from the admin dashboard or a logged-in admin context — not with a bare token.

**Recommended follow-up:** call the single-VA reindex from VA Hub's VA publish/update flow so the
index self-maintains.

---

## 8. Rules & constraints (summary for an AI agent)

1. Call `POST /api/match-vas` **from the server only**, with `Authorization: Bearer <MATCH_API_SECRET>`.
2. `text` is required, non-empty, ≤ 4000 chars. `limit` is 1–10 (default 3).
3. Always pass `leadId` so attribution works.
4. An **empty `matches` array is normal** — handle it, don't error.
5. Respect `429` + `Retry-After`; back off on `502`.
6. The response contains **no VA email, phone, or portfolio** — by design. Never try to work around this.
7. Put **`profileUrl` verbatim** into outreach; keep its `src`/`lead` query params intact.
8. Use `displayName` (e.g. "Maria S.") in copy — never a full last name.
9. Only active, non-Hired VAs are ever returned; you do not need to filter for availability yourself
   (though `availability` is provided for copywriting).

---

## 9. Reference — VA Hub implementation

| Concern | File |
|---------|------|
| Migration (table + `match_vas()` RPC) | `migrations/add_va_matching.sql` |
| Data access (index/list/match, headshot URL) | `lib/data/va-matching.ts` |
| Service (profile text, reindex, safe DTO, profile URL) | `lib/va-matching.ts` |
| Public matching API | `app/api/match-vas/route.ts` |
| Admin reindex/backfill API | `app/api/admin/va-index/reindex/route.ts` |
| Embeddings (Gemini `text-embedding-004`) | `lib/chat/embeddings.ts` |
| Rate limiting (Upstash/Vercel KV) | `lib/rate-limit.ts` |

Tests: `lib/va-matching.test.ts`, `app/api/match-vas/route.test.ts`,
`app/api/admin/va-index/reindex/route.test.ts`.
