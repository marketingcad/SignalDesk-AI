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
3. **Score** — Every qualifying post is scored (0-100) by a weighted keyword engine in [`lib/intent-scoring.ts`](lib/intent-scoring.ts), using **user-customizable keywords from the Settings page** (stored in Supabase), optionally enhanced by Google Gemini AI analysis via [`lib/ai-lead-qualifier.ts`](lib/ai-lead-qualifier.ts)
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
├── apify-service/          # Apify actor orchestrator + webhook receiver
├── extension/              # Chrome MV3 extension (content scripts + popup)
├── src-tauri/              # Tauri desktop app shell (Rust)
│   ├── src/main.rs         # Spawns Next.js + scraper, manages lifecycle
│   ├── tauri.conf.json     # Window, updater, CSP, bundle config
│   └── capabilities/       # Tauri permission capabilities
├── .github/workflows/      # CI/CD (release.yml — multi-OS builds)
├── supabase/               # Database migrations and schema
├── scripts/                # Utility scripts (setup, token generation)
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
        │                                        └─ Post keyword filtering
        │
        └──► /api/leads/batch ──► DynamicScoringConfig
                                    ├─ AI lead qualifier (keyword fallback)
                                    └─ Intent scoring engine
```

- **Scraper Service** fetches keywords from `/api/keywords/search-queries` on startup and before every run
- **Batch processing** builds a `DynamicScoringConfig` from DB keywords for scoring
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
| **Settings** | Platform toggles, **customizable keywords** (primary/secondary/negative), alert threshold, scoring rules |
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

### keywords
User-customizable keywords managed from the Settings page:
- `id`, `keyword`, `category` (`high_intent`, `medium_intent`, `negative`), `created_at`
- Used by the scraper service for search queries, Google dorks, and post filtering
- Used by the scoring engine via `DynamicScoringConfig` for lead qualification
- Falls back to static defaults in [`lib/keywords.ts`](lib/keywords.ts) when empty

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
# 1. Bump version in package.json AND src-tauri/tauri.conf.json
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

### Platform-Specific Requirements

| Platform | Prerequisite |
|----------|-------------|
| **Windows** | [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++". Disable Smart App Control for local builds. |
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Linux** | `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev` |
