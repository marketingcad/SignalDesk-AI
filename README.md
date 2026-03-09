# Signal Desk AI

Lead intelligence dashboard for **Virtual Assistant hiring detection**. Scrapes social media posts from Facebook, LinkedIn, Reddit, and X, scores them by VA hiring intent, and alerts you on Discord when qualified leads are detected.

---

## How It Works

1. **Scrape** — Apify actors crawl Facebook groups, Reddit subreddits, LinkedIn, and X for posts
2. **Pre-filter** — The Apify service rejects self-promotion and job-seeking posts using negative keyword matching
3. **Score** — Every qualifying post is scored (0–100) by a weighted keyword engine in [`lib/intent-scoring.ts`](lib/intent-scoring.ts)
4. **Store** — Leads are saved to Supabase with score, category, and matched keywords
5. **Alert** — Leads scoring **>= 65** trigger a Discord notification via the Smart Alert Engine

---

## Intent Scoring Engine

### Intent Levels

| Level      | Score Range | Color          |
|------------|-------------|----------------|
| **High**   | 80 – 100    | Green (Emerald)|
| **Medium** | 50 – 79     | Amber          |
| **Low**    | 0 – 49      | Gray           |

### Score Calculation

The score is the sum of **positive signals**, **negative signals**, and **bonuses**, clamped to 0–100.

#### A. Direct Hiring Intent (+40)

Explicit statements of hiring a VA.

| Weight | Example Keywords |
|--------|-----------------|
| **+40** | "hiring a virtual assistant", "hire a va", "need a va", "va needed" |
| **+40** | "hiring remote assistant", "hiring executive assistant remote" |
| **+40** | "hiring ghl va", "hiring social media va", "hiring real estate va" |
| **+40** | "hiring cold caller va", "hiring appointment setter" |
| **+40** | "need admin support", "need someone to manage my crm" |
| **+40** | "need help with inbox", "need someone to manage emails" |
| **+40** | "outsourcing admin work" |

#### Urgency Boosters (+20)

| Weight | Example Keywords |
|--------|-----------------|
| **+20** | "hiring immediately va", "urgent va hire", "urgently need a va" |
| **+20** | "asap", "urgently", "immediately" |

#### B. Recommendation Requests (+20)

Asking for referrals or suggestions.

| Weight | Example Keywords |
|--------|-----------------|
| **+20** | "any va recommendations", "who can recommend a va" |
| **+20** | "best va service", "where to find a va", "where to hire a va" |
| **+20** | "thinking of hiring a va", "should i hire a va" |
| **+20** | "is it worth hiring a va", "has anyone hired a va" |

#### C. Budget / Pricing Inquiries (+20)

| Weight | Example Keywords |
|--------|-----------------|
| **+20** | "how much does a va cost", "virtual assistant rates" |
| **+20** | "va pricing", "va cost", "va rates" |

#### D. Overwhelm / Delegation Signals (+15)

Implicit signals of needing help.

| Weight | Example Keywords |
|--------|-----------------|
| **+15** | "overwhelmed with admin", "drowning in tasks" |
| **+15** | "too many client messages", "need extra help in my business" |
| **+15** | "need support in my business", "scaling my business and need help" |

#### E. Tool / Skill-Based Triggers (+15)

These increase intent score when paired with hiring language.

| Weight | Example Keywords |
|--------|-----------------|
| **+15** | "gohighlevel", "ghl", "clickfunnels", "hubspot", "salesforce", "zapier" |
| **+15** | "crm setup", "automation setup", "funnel building", "lead management" |
| **+15** | "appointment booking", "email marketing", "social media management" |
| **+15** | "facebook ads support", "tiktok management", "bookkeeping", "quickbooks" |
| **+15** | "data entry", "customer support" |

A post saying *"Looking for someone to manage my GHL account"* classifies as **Virtual Assistant – Technical**.

#### Negative Signals (subtract points)

| Category        | Weight   | Example Keywords                                |
|-----------------|----------|-------------------------------------------------|
| Job Seeker      | **-40**  | "i am looking for a va job", "i'm a virtual assistant" |
| Self-Promotion  | **-30**  | "offering va services", "hire me", "available for hire" |
| DM Solicitation | **-20**  | "dm me for", "dm for rates" |

These penalize posts from people **offering** VA services rather than **seeking** them.

#### Bonuses

| Bonus            | Points | Condition                                        |
|------------------|--------|--------------------------------------------------|
| Country Match    | **+10**| Post mentions US, UK, Australia, or Canada       |
| Engagement Boost | **+5** | Post engagement score > 5 (likes + comments + shares) |

### Scoring Examples

**Example 1 — High Intent (70 pts, Discord alert sent):**
> "Hiring a VA to manage my HubSpot CRM, based in the US"
- Direct Hiring: +40
- Tool Trigger (HubSpot): +15
- Country Match: +10
- Engagement Boost: +5

**Example 2 — High Intent (95 pts):**
> "I desperately need to hire a VA ASAP, drowning in admin tasks, any recommendations?"
- Direct Hiring: +40
- Urgency (ASAP): +20
- Delegation Signal: +15
- Recommendation Request: +20

**Example 3 — Filtered Out (score near 0):**
> "I'm a virtual assistant offering VA services, DM me for rates"
- Job Seeker: -40
- Self-Promotion: -30
- DM Solicitation: -20

---

## Discord Notifications

Discord alerts are managed by the **Smart Alert Engine** in [`lib/alert-engine.ts`](lib/alert-engine.ts). **Notifications are sent for leads scoring >= 65** (covers all High Intent and strong Medium Intent leads).

### All Conditions Required for a Discord Notification

| #  | Condition | Where to check |
|----|-----------|----------------|
| 1  | `DISCORD_WEBHOOK_URL` env variable is set | `.env` / `.env.local` |
| 2  | `discord_enabled` is `true` | Dashboard → Settings page |
| 3  | Lead intent score **>= 65** | Lead must score 65+ |
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
| Apify Scraper         | `/api/apify/webhook`       | Apify actor completes, leads scored >= 65   |
| Facebook Webhook      | `/api/facebook/webhook`    | Real-time Facebook feed event classified    |
| Single Lead Upload    | `/api/leads/process`       | Manual single lead submitted via API        |
| Batch Lead Upload     | `/api/leads/batch`         | Bulk lead import via API                    |

The **Apify Service** also sends a **scrape cycle summary** to Discord after every run (regardless of intent score) via [`apify-service/src/discord.js`](apify-service/src/discord.js).

---

## Troubleshooting: Leads But No Discord Notifications?

Check these causes in order of likelihood:

### 1. Most leads score below 65
Discord only fires for leads with **score >= 65**. Check your dashboard — filter by intent level and see how many reach that threshold.

### 2. `DISCORD_WEBHOOK_URL` is missing or invalid
Verify your `.env` / `.env.local` has:
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
```

### 3. Discord notifications are disabled in Settings
Go to **Dashboard → Settings** and confirm the toggle is **ON**.

### 4. Leads were inserted directly into the database
If leads were imported into Supabase manually (not through the API routes), the scoring and alert pipeline was never triggered. Only leads processed through `/api/leads/process`, `/api/leads/batch`, `/api/apify/webhook`, or `/api/facebook/webhook` trigger alerts.

### 5. Deduplication suppressed the alerts
Same author + platform within a 2-hour window = only the first alert goes through.

### 6. Rate limit was reached
10 messages/hour cap + 5-minute cooldown. A large batch could exceed this.

### Quick Diagnostic Checklist
- [ ] Verify `DISCORD_WEBHOOK_URL` is set in your environment
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
