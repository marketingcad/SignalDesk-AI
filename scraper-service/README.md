# SignalDesk AI — Scraper Service

Automated lead detection engine that scrapes social platforms for Virtual Assistant hiring signals using **Playwright + Crawlee + node-cron**.

This service runs alongside the existing Apify service and Chrome extension — it does **not** replace them.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Scraper Service                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  Reddit   │  │   X      │  │ LinkedIn │  │Facebook│ │
│  │ Scraper   │  │ Scraper  │  │ Scraper  │  │Scraper │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │              │              │             │      │
│       └──────────────┴──────┬───────┴─────────────┘      │
│                             │                            │
│                 ┌───────────▼──────────┐                 │
│                 │   Crawler Manager    │                 │
│                 │  (pre-filter, dedup) │                 │
│                 └───────────┬──────────┘                 │
│                             │                            │
│              ┌──────────────┼──────────────┐             │
│              ▼              ▼              ▼             │
│     ┌──────────────┐ ┌──────────┐ ┌────────────┐       │
│     │Backend Client│ │ Discord  │ │  Scheduler │       │
│     │(POST /batch) │ │ Webhook  │ │ (node-cron)│       │
│     └──────┬───────┘ └──────────┘ └────────────┘       │
│            │                                            │
└────────────┼────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│  Next.js Backend API    │
│  /api/leads/batch       │
│  (AI scoring + storage) │
└─────────────────────────┘
```

---

## How It Works

### 1. Scraper Layer (Playwright + Crawlee)

Each platform has its own scraper module using Playwright headless browsers:

| Platform | Strategy | Login Required |
|----------|----------|---------------|
| **Reddit** | Crawls `old.reddit.com/r/{sub}/search` for VA-related posts | No |
| **X (Twitter)** | Uses Nitter instances (privacy-friendly Twitter mirrors) | No |
| **LinkedIn** | Google dorking: `site:linkedin.com/posts "query"` | No |
| **Facebook** | Google dorking: `site:facebook.com/groups "query"` | No |

All scrapers:
- Use headless Chromium via Playwright
- Scroll pages to load dynamic content
- Extract post text, author, URL, engagement, timestamp
- Normalize data to a standard `ScrapedPost` format

### 2. Crawler Manager

The crawler manager orchestrates all scrapers:
- **Pre-filters** posts to reject job seekers and self-promotion
- **Sends** qualified posts to the Next.js backend via `/api/leads/batch`
- **Reports** errors to Discord
- **Prevents** concurrent runs

### 3. Scheduler (node-cron)

Automated scraping schedules:

| Platform | Default Schedule |
|----------|-----------------|
| Reddit | Every 15 minutes |
| X/Twitter | Every 5 minutes |
| LinkedIn | Every 10 minutes |
| Facebook | Every 30 minutes |
| Full Run | Every 2 hours |

All schedules are configurable via environment variables.

### 4. Backend Integration

Posts are sent to the main Next.js API:
- `POST /api/leads/batch` with Bearer token auth
- The backend handles AI scoring (Gemini), keyword scoring, deduplication
- High/Medium intent leads trigger Discord alerts
- All leads are stored in Supabase PostgreSQL

### 5. Discord Alerts

The scraper sends its own operational alerts:
- **Run summaries** — posts found per platform, duration, errors
- **Error alerts** — when a scraper fails

(Lead-level alerts are handled by the main backend's alert engine)

---

## Setup

### 1. Install dependencies

```bash
cd scraper-service
npm install
npx playwright install chromium
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
BACKEND_API_URL=http://localhost:3000
BACKEND_AUTH_TOKEN=your_jwt_token
DISCORD_WEBHOOK_URL=your_discord_webhook
PORT=4000
```

### 3. Run in development

```bash
npm run dev
```

### 4. Build and run production

```bash
npm run build
npm start
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check + uptime |
| `GET` | `/api/status` | Config, targets, schedule info |
| `POST` | `/api/run` | Trigger full scraper run (all platforms) |
| `POST` | `/api/run/:platform` | Trigger single platform (Reddit, X, LinkedIn, Facebook) |

All `POST` endpoints require `Authorization: Bearer <token>` header.

### Examples

```bash
# Health check
curl http://localhost:4000/health

# Trigger full run
curl -X POST http://localhost:4000/api/run \
  -H "Authorization: Bearer your_token"

# Trigger Reddit only
curl -X POST http://localhost:4000/api/run/Reddit \
  -H "Authorization: Bearer your_token"
```

---

## Manual Scraping (CLI)

Run scrapers directly without starting the server:

```bash
# All platforms
npm run scrape

# Single platform
npm run scrape:reddit
npm run scrape:x
npm run scrape:linkedin
npm run scrape:facebook
```

---

## Project Structure

```
scraper-service/
├── src/
│   ├── index.ts                 # Express server entry point
│   ├── types.ts                 # Shared TypeScript interfaces
│   ├── config/
│   │   └── index.ts             # Environment config loader
│   ├── scrapers/
│   │   ├── index.ts             # Barrel export
│   │   ├── redditScraper.ts     # Reddit via old.reddit.com
│   │   ├── xScraper.ts          # X via Nitter instances
│   │   ├── linkedinScraper.ts   # LinkedIn via Google dork
│   │   └── facebookScraper.ts   # Facebook via Google dork
│   ├── crawler/
│   │   └── crawlerManager.ts    # Orchestrator + pre-filter
│   ├── scheduler/
│   │   └── cronJobs.ts          # node-cron job definitions
│   ├── api/
│   │   └── backendClient.ts     # HTTP client → Next.js API
│   └── alerts/
│       └── discord.ts           # Discord webhook notifications
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Data Flow

```
1. node-cron triggers scraper on schedule
2. Playwright opens headless browser
3. Crawlee manages page crawling + extraction
4. Posts are pre-filtered (reject job seekers)
5. Qualified posts sent to Next.js /api/leads/batch
6. Backend scores with AI (Gemini) + keyword engine
7. Leads stored in Supabase PostgreSQL
8. High/Medium intent → Discord alert
9. All leads visible in Next.js dashboard
```

---

## How This Fits With Existing Services

SignalDesk AI has **three** data ingestion channels that all feed into the same backend:

| Service | Technology | When to Use |
|---------|-----------|-------------|
| **Apify Service** | Apify cloud actors | Scheduled cloud scraping (paid actors) |
| **Scraper Service** (this) | Playwright + Crawlee | Self-hosted scraping (free, open-source) |
| **Chrome Extension** | Content scripts | Manual browsing detection (real-time) |

All three send to `POST /api/leads/batch` with the same payload format.

---

## Rate Limiting & Anti-Detection

- **Headless mode** with anti-automation flags
- **Max concurrency** of 1-2 browsers per platform
- **Configurable delays** between scrolls and requests
- **Pauses between platforms** during full runs
- **Nitter instances** for X (avoids Twitter rate limits)
- **Google dorking** for LinkedIn/Facebook (avoids login requirements)
- **Duplicate detection** at both scraper and backend levels

---

## Troubleshooting

### Playwright browser not found
```bash
npx playwright install chromium
```

### 429 rate limiting from Google
Increase `SCROLL_DELAY_MS` and reduce cron frequency.

### Nitter instances down
The X scraper randomly selects from multiple Nitter instances. If all are down, it falls back gracefully.

### Posts not appearing in dashboard
Check:
1. `BACKEND_AUTH_TOKEN` matches a valid JWT
2. `BACKEND_API_URL` points to running Next.js server
3. Posts aren't being filtered as duplicates
