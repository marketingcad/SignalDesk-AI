# Signal Desk AI

Lead intelligence dashboard for **Virtual Assistant hiring detection**. Scrapes social media posts from Facebook, LinkedIn, Reddit, and X, scores them by VA hiring intent using AI + keyword analysis, and alerts you on Discord when qualified leads are detected.

---

## Architecture Overview

```
                        +-------------------+
                        |  Chrome Extension |
                        |  (MV3 Content     |
                        |   Scripts)        |
                        +--------+----------+
                                 |
                                 | POST /api/leads/batch
                                 v
+------------------+    +-------------------+    +------------------+
| Apify Service    +--->|  Next.js Backend  |<---+ Scraper Service  |
| (Cloud Actors)   |    |  (API Routes)     |    | (Playwright +    |
+------------------+    +--------+----------+    |  Crawlee + Cron) |
                                 |               +------------------+
                    +------------+------------+
                    |            |             |
                    v            v             v
              +---------+  +---------+  +------------+
              |Supabase |  | Discord |  | Google     |
              |(Postgres)|  | Webhook |  | Gemini AI  |
              +---------+  +---------+  +------------+
```

---

## How It Works

### End-to-End Pipeline

1. **Scrape** — Posts are collected from Facebook groups, Reddit subreddits, LinkedIn, and X via three methods:
   - **Chrome Extension** — Content scripts detect posts in real-time as you browse
   - **Scraper Service** — Playwright + Crawlee crawlers run on a cron schedule
   - **Apify Service** — Cloud-hosted Apify actors scrape at scale
2. **Pre-filter** — Self-promotion and job-seeking posts are rejected using negative keyword matching before they reach the backend
3. **Score** — Every qualifying post is scored (0-100) by a weighted keyword engine in [`lib/intent-scoring.ts`](lib/intent-scoring.ts), optionally enhanced by Google Gemini AI analysis via [`lib/ai-lead-qualifier.ts`](lib/ai-lead-qualifier.ts)
4. **Deduplicate** — Posts are deduplicated by URL and content hash to prevent duplicates across sources
5. **Store** — Leads are saved to Supabase with score, category, matched keywords, and AI qualification data
6. **Alert** — Leads scoring **>= 65** trigger a Discord notification via the Smart Alert Engine in [`lib/alert-engine.ts`](lib/alert-engine.ts)
7. **Dashboard** — Real-time analytics with filtering, charts, and lead management

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| Auth | bcryptjs (password hashing), jose (JWT signing, 7-day sessions) |
| Scraping | Playwright + Crawlee (scraper-service), Apify SDK (apify-service) |
| Scheduling | node-cron (scraper-service), Apify triggers |
| Notifications | Discord Webhooks, Nodemailer (email) |
| AI | Google Generative AI (Gemini) for lead qualification |
| Browser Extension | Chrome MV3, content scripts + service worker |
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
├── apify-service/          # Apify actor orchestrator + webhook receiver
├── extension/              # Chrome MV3 extension (content scripts + popup)
├── supabase/               # Database migrations and schema
├── scripts/                # Utility scripts (token generation)
└── public/                 # Static assets
```

---

## Data Collection Sources

### 1. Chrome Extension

The Chrome MV3 extension injects content scripts into supported platforms and monitors posts in real-time:

- **Supported sites:** Facebook groups, LinkedIn feed/groups, Reddit subreddits, X home/search
- **How it works:**
  1. Content scripts use `MutationObserver` to detect new posts as the page loads
  2. Extracts author, text, URL, and engagement (likes/comments/shares)
  3. Pre-filters short or spammy posts client-side
  4. Batches posts (up to 50 posts, 5-second flush window) in the service worker
  5. Sends to `POST /api/leads/batch` with JWT Bearer token
- **Offline support:** Queues posts when offline via IndexedDB buffer
- **Deduplication:** IndexedDB-based persistent dedup prevents re-sending the same post
- **Auto-monitoring:** Configurable auto-scroll + timed monitoring (2-minute default interval)

### 2. Scraper Service (Self-Hosted)

A standalone Node.js service using Playwright and Crawlee for automated headless scraping:

- **Platforms:** Reddit, X, LinkedIn, Facebook
- **Scheduling:** Cron-based via `node-cron`, configurable per-URL schedules
- **Delivery:** Sends scraped leads to `POST /api/leads/batch`
- **Discord summaries:** Posts a scrape cycle summary after every run

### 3. Apify Service (Cloud)

Integrates with Apify's cloud scraping platform for managed, scalable scraping:

- **Webhook receiver:** `POST /api/apify/webhook` handles Apify actor completion callbacks
- **Dataset normalization:** Transforms Apify output to the standard lead format
- **Manual triggers:** API endpoints to trigger runs per-platform or scrape specific URLs
- **URL Scheduling:** CRUD API for custom URL scraping schedules with cron expressions

---

## Intent Scoring Engine

Every post is scored 0-100 by a weighted keyword engine. The score determines the **intent level** and whether a Discord alert is sent.

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
| Direct Hiring Intent | **+40** | "hiring a virtual assistant", "hire a va", "need a va", "outsourcing admin work" |
| Urgency Boosters | **+20** | "hiring immediately", "urgent va hire", "asap" |
| Recommendation Requests | **+20** | "any va recommendations", "where to find a va", "should i hire a va" |
| Budget / Pricing Inquiries | **+20** | "how much does a va cost", "virtual assistant rates" |
| Overwhelm / Delegation Signals | **+15** | "overwhelmed with admin", "drowning in tasks", "scaling my business" |
| Tool / Skill Triggers | **+15** | "gohighlevel", "hubspot", "zapier", "crm setup", "funnel building" |

#### Negative Signals

| Category | Weight | Example Keywords |
|----------|--------|-----------------|
| Job Seeker | **-40** | "i am looking for a va job", "i'm a virtual assistant" |
| Self-Promotion | **-30** | "offering va services", "hire me", "available for hire" |
| DM Solicitation | **-20** | "dm me for", "dm for rates" |

#### Bonuses

| Bonus | Points | Condition |
|-------|--------|-----------|
| Country Match | **+10** | Post mentions US, UK, Australia, or Canada |
| Engagement Boost | **+5** | Post engagement > 5 (likes + comments + shares) |

### AI Lead Qualification

Posts can also be analyzed by Google Gemini AI via [`lib/ai-lead-qualifier.ts`](lib/ai-lead-qualifier.ts), which evaluates:
- Hiring intent and urgency
- Budget indicators and spam risk
- Tasks/skills the poster needs
- Returns structured qualification data stored as JSONB in the database

---

## Authentication

JWT-based session authentication:

1. **Login** — User submits email/password to `POST /api/auth/login`
2. **Verification** — Password compared against bcrypt hash in Supabase `users` table
3. **Session** — JWT token (HS256, 7-day expiry) set as an `httpOnly` cookie
4. **Middleware** — Protected routes check the session cookie on every request
5. **Extension auth** — Chrome extension stores the JWT and sends it as a `Bearer` token

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
| POST | `/api/leads/process` | Ingest single lead (score + alert) |
| POST | `/api/leads/batch` | Bulk ingest from extension/scraper |
| POST | `/api/leads/qualify` | AI qualification |
| POST | `/api/leads/scrape-url` | Scrape a URL for posts |
| GET | `/api/leads/scraped-posts` | Manual scrape history |
| DELETE | `/api/leads/:id` | Delete a lead |

### Dashboard
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/stats` | KPI stats (total, high-intent, avg score, 7-day trend) |
| GET | `/api/dashboard/chart` | Time-series lead counts |
| GET | `/api/dashboard/platform-counts` | Leads by platform breakdown |
| GET | `/api/dashboard/geography` | Leads by country |

### Webhooks
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/apify/webhook` | Apify actor completion callback |
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
| Apify Scraper | Apify actor completes, leads scored >= 65 |
| Facebook Webhook | Real-time Facebook feed event classified |
| Chrome Extension | Batch of leads submitted via extension |
| Manual Upload | Single lead submitted via API |

---

## Dashboard Pages

| Page | Description |
|------|-------------|
| **Dashboard** | KPI cards, lead trend chart, platform distribution, high-intent previews |
| **Leads** | Full leads table with filtering (platform, intent, status, date range, search) |
| **Alerts** | Real-time high-intent alerts feed |
| **Reports** | Daily/weekly lead reporting |
| **Scrape URL** | Manual URL scraping interface |
| **Settings** | Platform toggles, keywords, Discord webhook config, notification preferences |
| **Users** | User management (admin only) |

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

### facebook_post_logs
Audit trail for Facebook webhook events: post_id, author, message, classification, notified flag.

### scrape_url_history
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

# Apify (required for cloud scraping)
APIFY_API_TOKEN=
APIFY_WEBHOOK_SECRET=

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

## Getting Started

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

### Running the Apify Service

```bash
cd apify-service
npm install
npm start
```

### Loading the Chrome Extension

1. Build the extension: `cd extension && npm run build`
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `extension/dist` directory
5. Configure your API URL and login token in the extension popup
