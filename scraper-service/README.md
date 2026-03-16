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
Scrapes X posts via Nitter mirror instances. No login required.

### Browser Authentication

To log in to platforms that require authenticated sessions (e.g. Facebook, LinkedIn, X):

```bash
npm run auth:login
```

This opens a visible Chromium browser where you can manually log in. Session cookies are saved to `auth/storage-state.json` and reused by scrapers.

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

---

## Deployment (Free Hosting)

### Recommended: Render (Free Tier)

Render is the best free option for this service — it supports background workers, Docker, and has a generous free tier for web services.

#### Step 1: Prepare a Dockerfile

Create a `Dockerfile` in the `scraper-service/` folder:

```dockerfile
FROM node:20-slim

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium
RUN npx playwright install chromium

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 4000

CMD ["node", "dist/index.js"]
```

#### Step 2: Push to GitHub

Make sure your `scraper-service/` directory is pushed to your GitHub repository.

#### Step 3: Create a Render Web Service

1. Go to [render.com](https://render.com) and sign up / log in
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `signaldesk-scraper` |
| **Root Directory** | `scraper-service` |
| **Environment** | `Docker` |
| **Instance Type** | `Free` |
| **Region** | Pick closest to your backend |

5. Click **Advanced** → Add environment variables:

| Variable | Value |
|----------|-------|
| `BACKEND_API_URL` | Your deployed Next.js URL (e.g. `https://signaldesk.vercel.app`) |
| `BACKEND_AUTH_TOKEN` | Your JWT token |
| `DISCORD_WEBHOOK_URL` | Your Discord webhook |
| `PORT` | `4000` |
| `NODE_ENV` | `production` |

6. Click **Create Web Service**

#### Step 4: Verify deployment

Once deployed, check the health endpoint:

```bash
curl https://signaldesk-scraper.onrender.com/health
```

Trigger a test run:

```bash
curl -X POST https://signaldesk-scraper.onrender.com/api/run \
  -H "Authorization: Bearer your_token"
```

#### Render Free Tier Limitations

- Service **spins down after 15 minutes** of inactivity — cron jobs won't run while spun down
- To keep it alive, set up a free uptime monitor (e.g. UptimeRobot) to ping `/health` every 14 minutes
- 750 free hours/month (enough for one always-on service)

---

### Alternative: Railway (Free Tier)

Railway offers $5/month free credit — enough for a lightweight scraper.

1. Go to [railway.app](https://railway.app) and sign up
2. Click **New Project** → **Deploy from GitHub Repo**
3. Select your repo and set **Root Directory** to `scraper-service`
4. Railway auto-detects the Dockerfile
5. Add environment variables in the **Variables** tab (same as Render above)
6. Deploy — Railway gives you a public URL automatically

---

### Alternative: Fly.io (Free Tier)

Fly.io gives 3 free shared VMs — great for always-on services.

#### Step 1: Install the Fly CLI

```bash
# Windows (PowerShell)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# macOS / Linux
curl -L https://fly.io/install.sh | sh
```

#### Step 2: Launch the app

```bash
cd scraper-service
fly auth login
fly launch --name signaldesk-scraper --region iad --no-deploy
```

#### Step 3: Set environment variables

```bash
fly secrets set BACKEND_API_URL=https://signaldesk.vercel.app
fly secrets set BACKEND_AUTH_TOKEN=your_jwt_token
fly secrets set DISCORD_WEBHOOK_URL=your_discord_webhook
fly secrets set PORT=4000
```

#### Step 4: Deploy

```bash
fly deploy
```

#### Step 5: Verify

```bash
curl https://signaldesk-scraper.fly.dev/health
```

---

### Keeping Cron Jobs Alive (Important)

Free tiers on Render and Railway spin down idle services. Since this scraper relies on `node-cron`, it needs to stay awake. Options:

| Method | How |
|--------|-----|
| **UptimeRobot** (free) | Ping `https://your-service.onrender.com/health` every 14 min |
| **cron-job.org** (free) | Hit `/api/run` on a schedule as a fallback |
| **Fly.io** | Does **not** spin down — best for always-on cron |

**Recommendation**: Use **Render** for easiest setup, or **Fly.io** if you need reliable cron scheduling without workarounds.
