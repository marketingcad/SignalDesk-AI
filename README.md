# Signal Desk AI

Lead intelligence dashboard that scrapes social media posts, scores them by hiring intent, and alerts you on Discord when high-intent leads are detected.

---

## How Intent Scoring Works

Every scraped post is run through a keyword-based scoring engine in [`lib/intent-scoring.ts`](lib/intent-scoring.ts). The final score (0–100) determines the intent level.

### Intent Levels

| Level      | Score Range | Color   |
|------------|-------------|---------|
| **High**   | 80 – 100    | Green (Emerald)  |
| **Medium** | 50 – 79     | Amber   |
| **Low**    | 0 – 49      | Gray    |

### Score Calculation

The score is the sum of **positive signals**, **negative signals**, and **bonuses**, clamped to 0–100.

#### Positive Signals (add points)

| Category                | Weight   | Example Keywords                                      |
|-------------------------|----------|-------------------------------------------------------|
| Direct Hiring           | **+40**  | "hiring a virtual assistant", "hire a va", "need a va"|
| Recommendation Request  | **+20**  | "any va recommendations", "who can recommend a va"    |
| Budget Inquiry          | **+20**  | "how much does a va cost", "va pricing"               |
| Delegation Signal       | **+15**  | "overwhelmed with admin", "drowning in tasks"         |
| Technical VA Request    | **+10**  | "gohighlevel", "hubspot", "crm setup"                |

A post can match multiple keywords and categories. The **most frequently matched category** becomes the lead's primary intent category.

#### Negative Signals (subtract points)

| Category        | Weight   | Example Keywords                                |
|-----------------|----------|-------------------------------------------------|
| Job Seeker      | **-40**  | "i am looking for a va job", "i'm a virtual assistant" |
| Self-Promotion  | **-30**  | "offering va services", "hire me", "available for hire"|
| DM Solicitation | **-20**  | "dm me for", "dm for rates"                     |

These penalize posts from people **offering** VA services rather than **seeking** them.

#### Bonuses

| Bonus            | Points | Condition                                        |
|------------------|--------|--------------------------------------------------|
| Country Match    | **+10**| Post mentions US, UK, Australia, or Canada       |
| Engagement Boost | **+5** | Post engagement score > 5 (likes + comments + shares) |

### Scoring Examples

**Example 1 — Medium Intent (60 pts):**
> "Hiring a VA to manage my HubSpot CRM, based in the US"
- Direct Hiring: +40
- Technical VA Request: +10
- Country Match: +10

**Example 2 — Medium Intent (75 pts):**
> "I desperately need to hire a VA, drowning in admin tasks, any recommendations?"
- Direct Hiring: +40
- Delegation Signal: +15
- Recommendation Request: +20

**Example 3 — Filtered Out (score near 0):**
> "I'm a virtual assistant offering VA services, DM me for rates"
- Job Seeker: -40
- Self-Promotion: -30
- DM Solicitation: -20

Add a country mention or high engagement to Examples 1–2 and they cross into **High Intent (80+)**.

---

## Discord Notifications

Discord alerts are managed by the **Smart Alert Engine** in [`lib/alert-engine.ts`](lib/alert-engine.ts). **Notifications are only sent for High Intent leads (score >= 80).**

### All Conditions Required for a Discord Notification

| #  | Condition | Where to check |
|----|-----------|----------------|
| 1  | `DISCORD_WEBHOOK_URL` env variable is set | `.env` / `.env.local` |
| 2  | `discord_enabled` is `true` | Dashboard → Settings page |
| 3  | Lead intent score **>= 80** (High Intent) | Lead must score 80+ |
| 4  | Not a duplicate (same author + platform not alerted in last 2 hrs) | Automatic dedup |
| 5  | Within rate limit (max 10 Discord messages/hour) | Automatic |
| 6  | Outside cooldown (min 5 min between batch sends) | Automatic |

**If any one of these conditions fails, no notification is sent.**

### Rate Limiting & Batching

| Setting              | Default  | Description                                    |
|----------------------|----------|------------------------------------------------|
| Batch Window         | 60 sec   | Alerts are collected for 60s before sending     |
| Max Alerts / Hour    | 10       | Hard cap on Discord messages per hour           |
| Cooldown             | 5 min    | Minimum gap between consecutive sends           |
| Dedup Window         | 2 hours  | Same author+platform ignored within this window |
| Digest Threshold     | 3 leads  | 3+ pending leads triggers a combined digest     |

### Notification Sources

| Source                | API Route                  | Trigger                                     |
|-----------------------|----------------------------|---------------------------------------------|
| Apify Scraper         | `/api/apify/webhook`       | Apify actor completes, leads scored >= 80   |
| Facebook Webhook      | `/api/facebook/webhook`    | Real-time Facebook feed event classified    |
| Single Lead Upload    | `/api/leads/process`       | Manual single lead submitted via API        |
| Batch Lead Upload     | `/api/leads/batch`         | Bulk lead import via API                    |

The **Apify Service** also sends a **scrape cycle summary** to Discord after every run (regardless of intent score) via [`apify-service/src/discord.js`](apify-service/src/discord.js).

---

## Why 192 Leads But No Discord Notifications?

Check these causes in order of likelihood:

### 1. Most leads score below 80 (most likely cause)

Discord only fires for **High Intent (score >= 80)**. If your 192 leads are mostly Medium (50–79) or Low (0–49), no alerts are sent. Check your dashboard — filter by intent level and count how many are actually "High".

### 2. `DISCORD_WEBHOOK_URL` is missing or invalid

Verify your `.env` / `.env.local` has:
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
```
If missing or malformed, all Discord sends silently fail (no error shown in dashboard).

### 3. Discord notifications are disabled in Settings

Go to **Dashboard → Settings** and confirm:
- Discord notifications toggle is **ON**
- The webhook URL field is filled in

### 4. Leads were inserted directly into the database

If leads were imported into Supabase manually (not through the API routes), the scoring and alert pipeline was never triggered. Only leads processed through `/api/leads/process`, `/api/leads/batch`, `/api/apify/webhook`, or `/api/facebook/webhook` trigger alerts.

### 5. Deduplication suppressed the alerts

Same author + platform within a 2-hour window = only the first alert goes through.

### 6. Rate limit was reached

10 messages/hour cap + 5-minute cooldown. A large batch of high-intent leads could exceed this.

### Quick Diagnostic Checklist

- [ ] Verify `DISCORD_WEBHOOK_URL` is set in your environment
- [ ] Verify Discord is enabled on the Settings page
- [ ] Count how many of your 192 leads are High Intent (score >= 80)
- [ ] Test webhook manually: `curl -X POST YOUR_WEBHOOK_URL -H "Content-Type: application/json" -d '{"content": "Test from Signal Desk"}'`
- [ ] Consider lowering the alert threshold in Settings if you want Medium Intent leads to also trigger notifications

---

## Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Discord (required for notifications)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN

# Apify (required for scraping)
APIFY_API_TOKEN=
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
