# Scraping Guide — Maximizing High-Intent VA Leads

This guide covers best practices for configuring Signal Desk AI (VA Hub desktop app) to find the highest quality Virtual Assistant hiring leads across Facebook, Reddit, LinkedIn, and X.

---

## Quick Start (Desktop App)

1. **Launch VA Hub** from your desktop
2. **Log in to social platforms** — click "Login to All Platforms" on the startup prompt (required for Facebook and LinkedIn)
3. **Configure keywords** — go to **Settings** > **Keywords** and add your target phrases
4. **Add Facebook groups** — go to **Scrape URL** > **Schedules** and add group URLs
5. **Let the scrapers run** — the built-in cron scheduler scrapes automatically on an interval

---

## Platform-by-Platform Strategy

### Facebook — Highest Lead Volume

Facebook business groups are where most people post about needing a VA. This is your primary lead source.

**Setup:**
1. Go to **Scrape URL** > **Schedules**
2. Create a schedule named "VA Hiring Groups"
3. Add direct Facebook group URLs (one per line):
   - Entrepreneur groups
   - E-commerce seller groups (Shopify, Amazon FBA)
   - Agency owner groups
   - Real estate investor groups
   - Coaching/consulting groups
4. Set frequency to **Every 2 hours**
5. Enable **Auto-scrape on create** to run immediately

**Important:** Target groups where **business owners** hang out — NOT groups specifically for VAs (those are full of VAs advertising themselves, not hiring).

**Login required:** Most valuable Facebook groups are private. You must log in via:
- The desktop app's login prompt on launch, OR
- The **Scrape URL** page "Open Login" button when a URL fails with "requires login"

**Recommended schedule:** Every 2 hours per group. The app handles rate limiting automatically.

---

### Reddit — Easiest to Scrape, High Quality

Reddit is fully public — no login needed. The built-in cron scraper searches subreddits using your keywords automatically.

**Default subreddits (already configured):**
- `r/entrepreneur` — business owners posting about hiring needs
- `r/smallbusiness` — small business operations, delegation
- `r/ecommerce` — e-commerce store owners needing VA help
- `r/startups` — startup founders looking for remote support
- `r/SaaS` — SaaS founders needing admin/support VAs
- `r/realestateinvesting` — real estate investors hiring VAs
- `r/dropship` — dropshipping store owners
- `r/FulfillmentByAmazon` — Amazon sellers needing inventory/listing VAs
- `r/hiring` — dedicated hiring subreddit
- `r/forhire` — hiring posts (filter out `[for hire]` via negative keywords)

**Customizing subreddits:** Edit `REDDIT_SUBREDDITS` in your scraper `.env` file, or add individual subreddit URLs in the **Scrape URL** scheduler.

**Recommended schedule:** Every 1 hour (default). Reddit has lenient rate limits.

**Tip:** Use `[hiring]` as a primary keyword — this is Reddit's standard tag for hiring posts.

---

### LinkedIn — Best for High-Budget Leads

LinkedIn leads are typically higher budget ($15-30+/hr). The scraper uses Google dorks (`site:linkedin.com/posts "keyword"`) since LinkedIn blocks direct scraping.

**How it works:**
1. The cron scraper builds Google search URLs using your keywords
2. Google's `tbs=qdr:w` parameter filters to last-week results
3. The scraper extracts LinkedIn post URLs from Google results
4. Each post is scraped for author, text, and engagement data

**Login recommended:** Authenticating with LinkedIn unlocks the Voyager API for richer data extraction (post details, author info). Log in via the desktop app's startup prompt.

**Recommended schedule:** Every 6 hours. Google dorks get rate-limited with more frequent scraping.

**Keyword tip:** LinkedIn posts use more professional language:
- "hiring virtual assistant" (not "need a VA")
- "looking for executive assistant"
- "outsourcing admin work"
- "need remote support for my business"

---

### X (Twitter) — Fast but Noisy

X is scraped via Google dorks (`site:x.com "keyword"`). It's fast but produces more noise — strong negative keywords are essential.

**How it works:** Same Google dork approach as LinkedIn.

**Recommended schedule:** Every 2-4 hours.

**Critical:** Add strong negative keywords in **Settings** to filter out the high volume of VAs self-promoting on X:
- "I'm a VA", "VA available", "DM me", "book a call"
- "VA for hire", "available for work", "offering services"
- "hire me", "accepting new clients"

---

## Keyword Strategy

Keywords are the backbone of the entire system. Every post must match at least one of your Settings keywords to become a lead.

### Where to Configure

Go to **Settings** > **Keywords** in the dashboard. Three categories:

| Category | Weight | Purpose | Example |
|----------|--------|---------|---------|
| **Primary (high_intent)** | +40 | Direct hiring phrases | "hiring a virtual assistant" |
| **Secondary (medium_intent)** | +20 | Research/consideration signals | "anyone recommend a VA" |
| **Negative** | -40 | Job seekers, self-promo — reject | "I'm a virtual assistant" |

### Recommended Primary Keywords (high_intent)

**Direct hiring:**
- "looking for a virtual assistant", "looking for a va"
- "hiring a virtual assistant", "hiring a va", "hire a va"
- "need a va", "need a virtual assistant"
- "virtual assistant needed", "va needed"
- "hiring remote assistant", "hiring executive assistant"
- "[hiring]" (Reddit tag)

**Role-specific:**
- "hiring appointment setter"
- "hiring social media va", "hiring social media manager"
- "hiring bookkeeping va", "hiring ecommerce va"
- "hiring cold caller va", "hiring lead generation va"
- "need someone to manage my crm"
- "need someone to manage emails"

**Tool-specific:**
- "hiring ghl va", "hiring gohighlevel va"
- "need va for shopify", "need va for hubspot"
- "need va for clickfunnels", "need va for zapier"

### Recommended Secondary Keywords (medium_intent)

**Research/recommendations:**
- "any va recommendations", "recommend a good va"
- "where to find a va", "where to hire a va"
- "should i hire a va", "thinking of hiring a va"
- "how much does a va cost", "virtual assistant rates"

**Overwhelm/delegation signals:**
- "overwhelmed with admin", "drowning in tasks"
- "need to delegate tasks", "too much on my plate"
- "need extra help in my business"
- "scaling my business and need help"
- "can't keep up with emails"

### Recommended Negative Keywords

**Self-identification:**
- "i'm a virtual assistant", "i am a va"
- "experienced virtual assistant", "certified virtual assistant"

**Self-promotion:**
- "offering va services", "hire me", "available for hire"
- "dm me for", "dm for rates", "book a discovery call"
- "accepting new clients", "open for clients"
- "my services include", "services i offer"

**Job seeking:**
- "looking for va work", "looking for a va job"
- "looking for work", "looking for clients"
- "[for hire]" (Reddit tag)

### Keyword Tips

1. **Quality over quantity** — 10-15 highly specific primary keywords beat 100 generic ones
2. **Test first** — manually search each platform with a keyword before adding it. If results are mostly hiring posts, it's good
3. **Review weekly** — check your leads and remove keywords that produce noise
4. **Short for Reddit** — Reddit post titles are short, so long phrases rarely match. Use "hiring VA" not "looking for a virtual assistant to help with my business"
5. **Professional for LinkedIn** — use formal language like "hiring executive assistant" rather than "need a VA"

---

## Scraping Schedules

### Built-in Cron Scraper (Automatic)

The desktop app runs these automatically in the background:

| Platform | Default Schedule | Method | Rate Limit |
|----------|-----------------|--------|------------|
| Reddit | Every 1 hour | Subreddit keyword search | 1 min between scrapes |
| X | Every 2 hours | Google dorks (`site:x.com`) | 1 min between scrapes |
| Facebook | Every 2 hours | Google dorks + group search | 5 min between scrapes |
| LinkedIn | Every 6 hours | Google dorks (`site:linkedin.com`) | 5 min between scrapes |

These use your **Settings keywords** for search queries and are fully automatic after initial setup.

### URL Scheduler (Manual Configuration)

For Facebook groups and specific URLs, use **Scrape URL** > **Schedules**:

| Target | Recommended Frequency | Notes |
|--------|----------------------|-------|
| Facebook group (5-10 groups) | Every 2 hours | Create one schedule group with all URLs |
| Specific subreddit | Every 1 hour | For subreddits not in the default list |
| LinkedIn profile/company | Every 6 hours | Google dorks handle most LinkedIn |

**Creating a schedule group:**
1. Go to **Scrape URL** > **Schedules** tab
2. Enter a name (e.g., "VA Hiring Groups")
3. Add multiple URLs (one per field)
4. Pick frequency (Every 2 hours recommended)
5. Check "Auto-scrape on create" to run immediately
6. The app scrapes each URL sequentially with rate limiting between them

### Monitoring Runs

Switch to the **Run History** tab to monitor:
- **Progress banner** — shows which URL is currently being scraped during group runs
- **Posts found** — click to expand and see every post with author, text, and matched keywords
- **Error alerts** — red banner for failed URLs (expired session, timeout, etc.)
- The tab **auto-refreshes every 5 seconds** during active scrapes

---

## Session Management (Login)

Facebook and LinkedIn require authentication for most content. The desktop app manages this automatically.

### On Every Launch

A login prompt appears with options:
- **Login to All Platforms** — opens a browser with Facebook, LinkedIn, and Twitter tabs
- **Individual platform buttons** — log in to just one
- **Use existing sessions** — skip if your sessions are still valid

### Refreshing Sessions

Sessions expire over time. Signs your session has expired:
- Run History shows repeated "0 posts found" for Facebook/LinkedIn
- Error messages mentioning "requires login" or "login page detected"
- Session health alerts on Discord (after 3+ consecutive 0-post runs)

To refresh:
- Use the login prompt on next app launch, OR
- Click "Open Login" on failed URL results in the Scrape URL page

### Session Storage

Sessions are saved locally and persist between app restarts:
- **Windows:** `%APPDATA%\com.signaldesk.vahub\server\scraper\`
- **macOS:** `~/Library/Application Support/com.signaldesk.vahub/server/scraper/`
- **Linux:** `~/.local/share/com.signaldesk.vahub/server/scraper/`

---

## How Posts Become Leads

Understanding the full pipeline helps you optimize for more high-intent leads:

```
Social Media Post
      │
      ▼
  ┌─────────────┐
  │ Date Filter  │ ── Only posts from last 7 days (rolling window)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Pre-Filter   │ ── Reject job seekers (Settings negative keywords)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Keyword Gate │ ── Must match >= 1 Settings keyword (high or medium intent)
  └──────┬──────┘    No match = post is discarded, never saved
         ▼
  ┌─────────────┐
  │ AI + Keyword │ ── Scored 0-100 using Settings keywords (weighted)
  │ Scoring      │    + optional Google Gemini AI analysis
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Dedup        │ ── Skip if URL or content already exists
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Save Lead    │ ── Stored in Supabase with score, keywords, AI data
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Discord      │ ── Alert sent if score >= 65 (with matched keywords)
  │ Notification │
  └─────────────┘
```

**Key insight:** The keyword gate is the most important filter. If your keywords are too broad, you get noise. If too narrow, you miss leads. Start with the recommended keywords above and adjust based on the leads you see.

---

## Troubleshooting

### No Leads Appearing

1. **Check keywords** — go to Settings > Keywords. Are there any primary/secondary keywords configured?
2. **Check Run History** — are scrapes running? Look for "0 posts found" or errors
3. **Check sessions** — Facebook/LinkedIn may need re-login
4. **Check filters** — the Leads page may have filters active that hide results

### Leads But Low Quality

1. **Add more negative keywords** — filter out VAs self-promoting
2. **Remove broad keywords** — keywords like "help" or "assistant" alone are too generic
3. **Target specific groups** — add Facebook group URLs for niche business communities

### Too Few Leads

1. **Add more subreddits** — edit `REDDIT_SUBREDDITS` in scraper `.env`
2. **Add Facebook group URLs** — in Scrape URL > Schedules
3. **Broaden medium-intent keywords** — add overwhelm/delegation signals
4. **Check date filter** — posts from the last 7 days are included

### No Discord Notifications

1. **Verify `DISCORD_WEBHOOK_URL`** in your `.env`
2. **Check Settings page** — Discord notifications toggle must be ON
3. **Check scores** — only leads scoring >= 65 trigger alerts
4. **Check rate limits** — max 10 alerts/hour, 5-min cooldown between batches

### Scraping Errors

| Error | Fix |
|-------|-----|
| "requires login" | Re-login via desktop app prompt or "Open Login" button |
| "page.goto: Timeout" | Platform may be slow or blocking. Will auto-retry |
| "ERR_ABORTED" | Network issue. Will auto-retry on next scheduled run |
| "0 posts found" (repeated) | Session expired — refresh login. Check session health alerts |

---

## Recommended Weekly Routine

1. **Monday** — Review last week's leads, dismiss low-quality ones, contact high-intent ones
2. **Midweek** — Check Run History for errors, refresh sessions if needed
3. **Friday** — Review keyword performance:
   - Are matched keywords relevant? Remove noisy ones
   - Missing any hiring patterns? Add new keywords
   - Use **Settings** > **Keyword Discovery** (AI-powered) for suggestions based on your best leads
