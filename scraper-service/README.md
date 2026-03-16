# SignalDesk AI — Scraper Service

Automated lead detection engine that scrapes social platforms for Virtual Assistant hiring signals using **Playwright + Crawlee + node-cron**.

This service runs on **port 4000** alongside the Next.js app (port 3000). The Next.js app calls this service internally via `http://localhost:4000`.

---

## Architecture

```
User Device
   ↓
Cloudflare Edge Network
   ↓
Secure Tunnel (trycloudflare.com)
   ↓
Your Laptop
   ├── Next.js (localhost:3000)   ← dashboard + API
   └── Scraper Service (localhost:4000) ← Playwright + Crawlee
            ↓
        Supabase (leads storage)
            ↓
        Discord (alerts)
```

---

## How It Works

### 1. Scraper Layer (Playwright + Crawlee)

Each platform has its own scraper using Playwright headless Chromium:

| Platform | Strategy | Login Required |
|----------|----------|----------------|
| **Reddit** | Crawls `old.reddit.com/r/{sub}/search` | No |
| **X (Twitter)** | Google dork: `site:x.com "query"` | No |
| **LinkedIn** | Google dork: `site:linkedin.com/posts "query"` | No |
| **Facebook** | Google dork: `site:facebook.com/groups "query"` | No |

All scrapers:
- Use headless Chromium via Playwright (no `--single-process` flag for stability)
- Scroll pages to load dynamic content
- Extract post text, author, URL, engagement, timestamp
- Normalize data to a standard `ScrapedPost` format

### 2. Crawler Manager

Orchestrates all scrapers:
- Pre-filters posts (rejects job seekers and self-promotion)
- Sends qualified posts to Next.js via `/api/leads/batch`
- Reports errors to Discord
- Prevents concurrent runs

### 3. Scheduler (node-cron)

| Platform | Default Schedule |
|----------|-----------------|
| Reddit | Every 15 minutes |
| X/Twitter | Every 5 minutes |
| LinkedIn | Every 10 minutes |
| Facebook | Every 30 minutes |

All schedules are configurable via environment variables.

### 4. Backend Integration

Posts are sent to the Next.js API:
- `POST /api/leads/batch` with Bearer token auth
- Backend handles AI scoring (Gemini), keyword scoring, deduplication
- High/Medium intent leads trigger Discord alerts
- All leads stored in Supabase PostgreSQL

### 5. URL Scraping (Manual)

The Next.js dashboard has a **Scrape URL** feature that calls:
```
POST /api/scrape-url
```
This endpoint accepts a URL (e.g. a Reddit thread or LinkedIn post) and returns scraped leads directly.

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

Edit `.env`:

```env
# Backend
BACKEND_API_URL=http://localhost:3000
BACKEND_AUTH_TOKEN=your_jwt_token

# Discord
DISCORD_WEBHOOK_URL=your_discord_webhook

# Port
PORT=4000

# Schedules
CRON_REDDIT=*/15 * * * *
CRON_X=*/5 * * * *
CRON_LINKEDIN=*/10 * * * *
CRON_FACEBOOK=*/30 * * * *

# Browser
HEADLESS=true
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

## Starting Everything (Recommended)

Use the `start-local.sh` script in the project root to start all services at once:

```bash
bash start-local.sh
```

This starts:
1. Scraper service on `http://localhost:4000`
2. Next.js on `http://localhost:3000`
3. Cloudflare Tunnel — prints your public URL automatically

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   YOUR PUBLIC URL:                                           ║
║   https://random-words.trycloudflare.com                     ║
║                                                              ║
║   Share this URL with anyone to access your dashboard        ║
║                                                              ║
║   Local:   http://localhost:3000                             ║
║   Scraper: http://localhost:4000                             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

> **Note**: The Cloudflare URL changes every time you restart. It requires no account — it's a free quick tunnel.

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

### Platform Commands

#### Facebook
```bash
# CLI
npm run scrape:facebook

# API
curl -X POST http://localhost:4000/api/run/Facebook \
  -H "Authorization: Bearer your_token"
```
Scrapes Facebook Groups via Google dorking (`site:facebook.com/groups "query"`). No login required.

#### LinkedIn
```bash
# CLI
npm run scrape:linkedin

# API
curl -X POST http://localhost:4000/api/run/LinkedIn \
  -H "Authorization: Bearer your_token"
```
Scrapes LinkedIn posts via Google dorking (`site:linkedin.com/posts "query"`). No login required.

#### X (Twitter)
```bash
# CLI
npm run scrape:x

# API
curl -X POST http://localhost:4000/api/run/X \
  -H "Authorization: Bearer your_token"
```
Scrapes X posts via Google dorking (`site:x.com "query"`). No login required.

#### Reddit
```bash
# CLI
npm run scrape:reddit

# API
curl -X POST http://localhost:4000/api/run/Reddit \
  -H "Authorization: Bearer your_token"
```
Crawls subreddits directly via `old.reddit.com`. No login required.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check + uptime |
| `GET` | `/api/status` | Config, targets, schedule info |
| `POST` | `/api/run` | Trigger full scraper run (all platforms) |
| `POST` | `/api/run/:platform` | Trigger single platform |
| `POST` | `/api/scrape-url` | Scrape a specific URL |

All `POST` endpoints require `Authorization: Bearer <token>` header.

### Examples

```bash
# Health check
curl http://localhost:4000/health

# Trigger full run
curl -X POST http://localhost:4000/api/run \
  -H "Authorization: Bearer your_token"

# Trigger single platform
curl -X POST http://localhost:4000/api/run/Reddit \
  -H "Authorization: Bearer your_token"

# Scrape a specific URL
curl -X POST http://localhost:4000/api/scrape-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{"url": "https://www.reddit.com/r/virtualassistant"}'
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
│   │   ├── browserArgs.ts       # Chromium launch flags
│   │   ├── redditScraper.ts     # Reddit via old.reddit.com
│   │   ├── xScraper.ts          # X via Google dork
│   │   ├── linkedinScraper.ts   # LinkedIn via Google dork
│   │   ├── facebookScraper.ts   # Facebook via Google dork
│   │   └── urlScraper.ts        # Manual URL scraping
│   ├── crawler/
│   │   ├── crawlerManager.ts    # Orchestrator + pre-filter
│   │   ├── browserAuth.ts       # Browser session auth
│   │   └── storage.ts           # Persistent storage helpers
│   ├── scheduler/
│   │   ├── cronJobs.ts          # node-cron job definitions
│   │   └── urlScheduler.ts      # URL schedule manager
│   ├── api/
│   │   └── backendClient.ts     # HTTP client → Next.js API
│   ├── alerts/
│   │   └── discord.ts           # Discord webhook notifications
│   └── utils/
│       ├── dateHelpers.ts       # Date formatting utils
│       └── postFilter.ts        # Pre-filter logic
├── storage/                     # Persisted JSON (schedules, runs)
├── .env                         # Your local env (not committed)
├── .env.example                 # Template
├── .gitignore
├── .dockerignore
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Data Flow

```
1. node-cron triggers scraper on schedule
     OR user clicks "Scrape" in dashboard
2. Playwright opens headless Chromium
3. Crawlee manages page crawling + extraction
4. Posts are pre-filtered (reject job seekers)
5. Qualified posts sent to Next.js /api/leads/batch
6. Backend scores with AI (Gemini) + keyword engine
7. Leads stored in Supabase PostgreSQL
8. High/Medium intent → Discord alert
9. All leads visible in Next.js dashboard
```

---

## Troubleshooting

### "Scraper service returned an unexpected response"
The scraper is not running. In a terminal:
```bash
cd scraper-service && npm run dev
```
Or use `bash start-local.sh` from the project root to start everything at once.

### Playwright browser not found
```bash
npx playwright install chromium
```

### "Target page, context or browser has been closed"
Google blocked the request (CAPTCHA / 429). The scraper will automatically retry.
Increase `SCROLL_DELAY_MS` in `.env` to reduce request speed.

### "spawn ps ENOENT" (Docker / Linux only)
The `ps` command is missing. The Dockerfile installs `procps` to fix this.

### Posts not appearing in dashboard
1. Check `BACKEND_AUTH_TOKEN` matches between `.env` (scraper) and `.env.local` (Next.js)
2. Check `BACKEND_API_URL=http://localhost:3000` in scraper `.env`
3. Posts may be filtered as duplicates

---

## Deployment (Optional — Fly.io Free)

If you want to run the scraper 24/7 in the cloud instead of on your laptop:

### Fly.io (recommended — never spins down, free)

#### Step 1: Install Fly CLI

```bash
# Windows PowerShell (as Admin)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

#### Step 2: Login

```bash
fly auth login
```

#### Step 3: Launch

```bash
cd scraper-service
fly launch --name signaldesk-scraper --region iad
# When asked "deploy now?" → say No
```

#### Step 4: Set secrets

```bash
fly secrets set BACKEND_API_URL=https://your-nextjs-app.vercel.app
fly secrets set BACKEND_AUTH_TOKEN=your_jwt_token
fly secrets set DISCORD_WEBHOOK_URL=your_discord_webhook
fly secrets set PORT=4000
```

#### Step 5: Deploy

```bash
fly deploy
```

#### Step 6: Verify

```bash
curl https://signaldesk-scraper.fly.dev/health
```

#### Useful commands

```bash
fly logs          # Live logs
fly status        # App status
fly ssh console   # SSH into container
fly scale memory 512  # Increase RAM if OOM
```

---

## Rate Limiting & Anti-Detection

- Headless mode with anti-automation flags
- No `--single-process` flag (prevents cascading browser crashes)
- Max concurrency of 1-2 browsers per platform
- Configurable delays between requests (`SCROLL_DELAY_MS`)
- Google dorking for LinkedIn/Facebook/X (avoids login requirements)
- Duplicate detection at both scraper and backend levels
