# Signal Desk AI — VA Lead Detection Keywords

Complete keyword reference for scraping social media platforms to find business owners who are **actively looking to hire Virtual Assistants**. These keywords power the entire lead detection pipeline: search queries, intent scoring, and negative filtering.

---

## How Keywords Work in the Pipeline

```
Keywords (Settings or defaults)
    │
    ├── Search Queries ──► Build search URLs (Facebook, X, LinkedIn, Reddit)
    │                       e.g. facebook.com/search/posts/?q=hiring+virtual+assistant
    │
    ├── Positive Keywords ──► Score each scraped post (0-100)
    │   ├── High Intent (+40)    → Direct hiring signals
    │   ├── Medium Intent (+20)  → Research / recommendation signals
    │   ├── Delegation (+15)     → Overwhelm / need help signals
    │   └── Technical (+15)      → Tool-specific VA requests
    │
    ├── Negative Keywords ──► Reject job seekers & self-promoters
    │   ├── Job Seeker (-40)     → "i'm a virtual assistant"
    │   ├── Self-Promotion (-30) → "hire me", "offering va services"
    │   └── DM Solicitation (-20)→ "dm me for rates"
    │
    └── Scoring Thresholds
        ├── High Intent:   score ≥ 80  → Hot lead, Discord alert
        ├── Medium Intent: score ≥ 50  → Warm lead, alert if ≥ 65
        └── Low Intent:    score < 50  → Logged, not alerted
```

---

## Search Queries (Used to Find Posts)

These are the queries used to search each platform. They cast a wide net to find posts where someone mentions VA hiring.

### Facebook Search Queries
```
hiring virtual assistant
need a VA
looking for virtual assistant
hire VA for business
hiring remote assistant
need admin support
hiring appointment setter
hiring social media va
looking for a va
overwhelmed need help
hiring ghl va
need someone to manage my crm
```

### X (Twitter) Search Queries
```
hiring virtual assistant
need a VA
looking for VA
hire a va
va needed
hiring remote assistant
hiring executive assistant remote
hiring ghl va
hiring social media va
hiring real estate va
hiring cold caller va
hiring appointment setter
need admin support
need someone to manage my crm
any va recommendations
recommend a good va
where to hire a va
overwhelmed with admin
scaling my business and need help
hiring GoHighLevel va
need someone for clickfunnels
hiring bookkeeping va
need va for hubspot
need va for salesforce
```

### LinkedIn Search Queries
```
hiring virtual assistant
need VA for business
looking for a virtual assistant
hire a virtual assistant
virtual assistant needed
hiring remote assistant
hiring executive assistant remote
need admin support
outsourcing admin work
where to find a va
thinking of hiring a va
need someone to manage my crm
overwhelmed with admin
hiring ghl va
hiring appointment setter
```

### Reddit Subreddits Monitored
```
r/entrepreneur
r/smallbusiness
r/ecommerce
r/startups
r/SaaS
r/realestateinvesting
r/dropship
r/FulfillmentByAmazon
r/hiring
r/forhire
r/virtualassistant
r/RemoteWork
r/Bookkeeping
r/socialmediamarketing
r/RealEstate
r/DigitalMarketing
```

---

## High Intent Keywords (+40 weight)

These indicate someone is **actively hiring or ready to hire** a VA. A single match scores the post at 40+ (Medium intent). Two matches push it to High intent (80+).

### Direct Hiring Phrases
| Keyword | Why It's High Intent |
|---------|---------------------|
| `looking for a virtual assistant` | Explicit search for a VA |
| `looking for a va` | Shorthand version |
| `hiring a virtual assistant` | Active hiring process |
| `hiring a va` | Active hiring, shorthand |
| `hiring va` | Active hiring, minimal |
| `hire a va` | Intent to hire |
| `hire a virtual assistant` | Intent to hire, full |
| `need a va` | Expressed need |
| `need a virtual assistant` | Expressed need, full |
| `want to hire a va` | Stated desire |
| `want to hire a virtual assistant` | Stated desire, full |
| `searching for a va` | Actively looking |
| `searching for a virtual assistant` | Actively looking, full |
| `virtual assistant needed` | Direct need statement |
| `va needed` | Direct need, shorthand |

### Role-Specific Hiring
| Keyword | Target Niche |
|---------|--------------|
| `hiring remote assistant` | Remote work |
| `hiring executive assistant remote` | Executive support |
| `hiring ghl va` | GoHighLevel CRM |
| `hiring gohighlevel va` | GoHighLevel CRM (full) |
| `hiring social media va` | Social media management |
| `hiring real estate va` | Real estate industry |
| `hiring cold caller va` | Sales / outreach |
| `hiring appointment setter` | Sales / scheduling |
| `hiring ecommerce va` | E-commerce operations |
| `hiring amazon va` | Amazon FBA |
| `hiring shopify va` | Shopify stores |
| `hiring etsy va` | Etsy marketplace |
| `hiring podcast va` | Podcast production |
| `hiring video editing va` | Video content |
| `hiring content writer va` | Content creation |
| `hiring lead generation va` | Lead gen / outreach |
| `hiring online assistant` | General online work |
| `hiring part time va` | Part-time role |
| `hiring full time va` | Full-time role |
| `hiring filipino virtual assistant` | Philippines-based VA |

### Task-Specific Needs
| Keyword | Task |
|---------|------|
| `need admin support` | Administrative tasks |
| `need someone to manage my crm` | CRM management |
| `need someone to handle admin` | Admin delegation |
| `need help with inbox` | Email management |
| `need someone to manage emails` | Email management |
| `need someone to book appointments` | Calendar / scheduling |
| `need someone for data entry` | Data entry |
| `need someone for customer service` | Customer support |
| `looking for someone to manage my social media` | Social media |
| `need someone to run my ads` | Paid advertising |
| `outsourcing admin work` | Admin outsourcing |
| `need a remote worker` | Remote staffing |
| `need a bookkeeping va` | Bookkeeping |
| `looking for an online assistant` | General online work |
| `looking for a remote assistant` | Remote staffing |
| `looking for a filipino va` | Philippines-based VA |

### Urgency Boosters (+20 extra)
| Keyword | Signal |
|---------|--------|
| `hiring immediately va` | Immediate need |
| `urgent va hire` | Urgent need |
| `urgently need a va` | Urgent need |
| `need a va asap` | ASAP need |
| `asap` | General urgency |
| `urgently` | General urgency |
| `immediately` | General urgency |

> A post with "hiring a va" (+40) + "asap" (+20) = 60 (Medium). Add a country match (+10) = 70 (Medium, alerts enabled).

---

## Medium Intent Keywords (+20 weight)

These indicate someone is **researching or considering** hiring a VA. They need a second signal to reach High intent.

### Recommendation Requests
| Keyword | Signal |
|---------|--------|
| `any va recommendations` | Seeking referrals |
| `who can recommend a virtual assistant` | Seeking referrals |
| `who can recommend a va` | Seeking referrals |
| `can anyone recommend a va` | Seeking referrals |
| `recommend a good va` | Seeking referrals |
| `best va service` | Comparing services |
| `where to find a va` | Research phase |
| `where to hire a va` | Research phase |
| `thinking of hiring a va` | Consideration phase |
| `considering hiring a va` | Consideration phase |
| `should i hire a va` | Decision phase |
| `has anyone hired a va` | Experience gathering |
| `is it worth hiring a va` | ROI evaluation |

### Budget / Pricing Inquiries
| Keyword | Signal |
|---------|--------|
| `how much does a va cost` | Pricing research |
| `virtual assistant rates` | Pricing research |
| `va pricing` | Pricing research |
| `va cost` | Pricing research |
| `va rates` | Pricing research |

> Budget questions strongly indicate intent to hire — people don't research VA costs without reason.

---

## Delegation Signal Keywords (+15 weight)

These indicate someone is **overwhelmed and may need a VA** but hasn't explicitly said so. They're weaker signals but valuable when combined with other keywords.

| Keyword | Signal |
|---------|--------|
| `overwhelmed with admin` | Admin overload |
| `drowning in tasks` | Task overload |
| `too many client messages` | Communication overload |
| `need extra help in my business` | General overwhelm |
| `need support in my business` | General overwhelm |
| `scaling my business and need help` | Growth-stage need |
| `need to delegate tasks` | Delegation intent |
| `spending too much time on admin` | Time management |
| `can't keep up with emails` | Email overload |
| `need help managing my calendar` | Calendar overload |

> A post with "overwhelmed with admin" (+15) + "need to delegate tasks" (+15) + "hiring a va" (+40) = 70 (Medium, alert-worthy).

---

## Technical VA Request Keywords (+15 weight)

These indicate someone needs a VA with **specific tool or skill expertise**. High-value leads because they know exactly what they need.

### CRM & Automation Tools
| Keyword | Tool/Skill |
|---------|------------|
| `gohighlevel` | GoHighLevel CRM |
| `ghl` | GoHighLevel (abbreviation) |
| `clickfunnels` | ClickFunnels |
| `hubspot` | HubSpot CRM |
| `salesforce` | Salesforce CRM |
| `zapier` | Zapier automation |
| `crm setup` | General CRM |
| `automation setup` | Workflow automation |

### Marketing & Content
| Keyword | Tool/Skill |
|---------|------------|
| `funnel building` | Sales funnels |
| `lead management` | Lead tracking |
| `email marketing` | Email campaigns |
| `social media management` | Social media |
| `facebook ads support` | Facebook Ads |
| `tiktok management` | TikTok |
| `content writing` | Written content |
| `lead generation` | Outbound leads |

### E-commerce & Operations
| Keyword | Tool/Skill |
|---------|------------|
| `shopify` | Shopify stores |
| `amazon fba` | Amazon FBA |
| `wordpress` | WordPress sites |
| `canva` | Graphic design |
| `mailchimp` | Email marketing |
| `quickbooks` | Bookkeeping |
| `bookkeeping` | Financial admin |
| `data entry` | Data management |
| `customer support` | Client service |

### Creative
| Keyword | Tool/Skill |
|---------|------------|
| `podcast editing` | Podcast production |
| `video editing` | Video production |
| `appointment booking` | Scheduling |

---

## Negative Keywords (Reject These Posts)

These identify **VAs looking for work** — the opposite of what we want. Posts matching these are filtered out before saving.

### Job Seeker Signals (-40 weight)
| Keyword | Why It's Rejected |
|---------|-------------------|
| `i'm a virtual assistant` | VA self-identification |
| `i am a virtual assistant` | VA self-identification |
| `i'm a va` | VA self-identification |
| `i am a va` | VA self-identification |
| `freelance va here` | VA advertising |
| `experienced virtual assistant` | VA resume |
| `certified virtual assistant` | VA credentials |
| `i am looking for a va job` | VA job seeking |
| `i'm looking for a va job` | VA job seeking |
| `looking for va work` | VA job seeking |
| `[for hire]` | Reddit hiring tag |

### Self-Promotion Signals (-30 weight)
| Keyword | Why It's Rejected |
|---------|-------------------|
| `offering va services` | Selling VA services |
| `i provide va services` | Selling VA services |
| `hire me` | Self-promotion |
| `va available` | Self-promotion |
| `available for hire` | Self-promotion |
| `open for clients` | Self-promotion |
| `looking for work` | Job seeking |
| `looking for clients` | Client seeking |
| `looking for va work` | VA job seeking |
| `looking for a va job` | VA job seeking |
| `i will be your virtual assistant` | Direct solicitation |
| `i can be your va` | Direct solicitation |
| `my services include` | Service listing |
| `services i offer` | Service listing |
| `accepting new clients` | Availability ad |
| `i offer virtual assistant` | Service ad |
| `years of experience as a va` | Resume/credential |

### Other Negative Signals (-20 to -25 weight)
| Keyword | Why It's Rejected |
|---------|-------------------|
| `i specialize in` | Resume language |
| `book a discovery call` | Sales funnel |
| `check out my portfolio` | Self-promotion |
| `dm me for` | DM solicitation |
| `dm for rates` | DM solicitation |

> **Important**: Negative keywords are checked FIRST. A post saying "I'm a virtual assistant looking for clients" contains both hiring and seeking signals — the negative match takes priority to avoid false leads.

---

## Bonus Scoring Signals

### Country Match (+10 bonus)
Posts mentioning these locations get a score boost because they indicate English-speaking, higher-budget markets:
```
united states, us-based, us timezone, us hours
united kingdom, uk-based
australia, australian
canada, canadian
```

### Engagement Bonus (+5)
Posts with engagement > 5 (likes + comments + shares) get a small boost — more engagement means more visibility and likely a real person posting.

---

## Score Examples

| Post Text | Matched Keywords | Score | Level |
|-----------|-----------------|-------|-------|
| "Hiring a VA for my Shopify store ASAP" | hiring a va (+40), shopify (+15), asap (+20) | 75 | Medium |
| "Need someone to manage my CRM, overwhelmed" | need someone to manage my crm (+40), overwhelmed with admin (+15) | 55 | Medium |
| "Looking for a virtual assistant, US-based preferred" | looking for a virtual assistant (+40), country match (+10) | 50 | Medium |
| "Hiring a VA + need someone to run my ads urgently" | hiring a va (+40), need someone to run my ads (+40), urgently (+20) | 100 | **High** |
| "Any VA recommendations? Thinking of hiring one for GoHighLevel" | any va recommendations (+20), thinking of hiring a va (+20), gohighlevel (+15) | 55 | Medium |
| "I'm a virtual assistant available for hire" | i'm a virtual assistant (-40), available for hire (-30) | 0 | **Rejected** |

---

## Customizing Keywords

All keywords are fully customizable from the **Settings** page in the dashboard (`/settings`):

1. **Primary Keywords** (high_intent) — Direct hiring signals, +40 weight
2. **Secondary Keywords** (medium_intent) — Research/recommendation signals, +20 weight
3. **Negative Keywords** — Job seeker/self-promotion filters

Changes take effect on the next scraper run (keywords are cached for 5 minutes). Database keywords always take priority over the defaults listed in this document.

### Keyword Discovery

The Settings page includes an AI-powered **Keyword Discovery** button that:
- Analyzes your recent leads
- Suggests new keywords based on patterns in high-scoring posts
- Lets you add them to any category with one click

---

## Adding New Keywords (Recommendations)

### High-Value Keywords to Consider Adding

**Industry-Specific Hiring**:
```
hiring real estate transaction coordinator
need va for property management
hiring insurance va
hiring medical billing va
hiring dental office va
need va for law firm
hiring legal assistant remote
```

**Platform-Specific**:
```
need va for notion
need va for monday.com
need va for asana
need va for trello
hiring va for woocommerce
need va for stripe
need va for xero
```

**Emerging Niches**:
```
hiring ai automation va
need va for chatgpt workflows
hiring va for midjourney
need va for make.com
hiring va for n8n
need someone for ai tools
```

**E-commerce Expansion**:
```
hiring amazon ppc va
need va for walmart marketplace
hiring tiktok shop va
need va for ebay listings
hiring product listing va
need va for inventory management
```

**High-Ticket Service Providers**:
```
hiring va for coaching business
need va for consulting firm
hiring va for agency
need someone to manage client onboarding
hiring va for course creator
need va for membership site
```

---

## File Reference

| File | Role |
|------|------|
| `lib/keywords.ts` | Static default keyword lists (seed data) |
| `lib/intent-scoring.ts` | Weighted scoring engine with all signals |
| `scraper-service/src/config/index.ts` | Env var search query defaults |
| `scraper-service/src/utils/postFilter.ts` | Pre-filter (reject patterns + negatives) |
| `scraper-service/src/scrapers/urlScraper.ts` | Keyword matching during scraping |
| `scraper-service/src/api/backendClient.ts` | Fetches keywords from Settings API |
| `app/(dashboard)/settings/page.tsx` | UI to manage all keywords |
