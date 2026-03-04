import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// GET /api/config — Returns dynamic configuration for the Chrome extension.
// The extension polls this endpoint periodically to stay in sync with
// keywords, scoring rules, and platform selectors without republishing.
// ---------------------------------------------------------------------------

// Current config version — bump when making breaking changes
const CONFIG_VERSION = 1;

export async function GET(request: NextRequest) {
  // --- Auth ---
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const session = await verifySession(authHeader.slice(7));
  if (!session) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // For now, return static config. In future, load from supabase service_configs table.
  const config = {
    version: CONFIG_VERSION,

    // Pre-filter keywords the extension uses client-side
    preFilter: {
      quickMatchKeywords: [
        "virtual assistant", "hiring", "looking for",
        "need someone", "need a va", "need admin", "remote assistant",
        "executive assistant", "cold caller", "appointment setter",
        "outsourc", "manage my crm", "handle admin", "manage emails",
        "book appointments", "help with inbox", "urgent",
        "hire a va", "hire a virtual", "looking to hire",
        "searching for a va", "want to hire",
        "va recommendations", "recommend a virtual", "best va",
        "va cost", "va pricing", "va rates", "worth hiring",
        "where to find a va", "thinking of hiring",
        "help in my business", "support in my business",
        "overwhelmed", "drowning in tasks", "too many client",
        "scaling my business", "need extra help", "delegate",
        "admin work",
        "crm", "gohighlevel", "ghl", "zapier", "clickfunnels",
        "hubspot", "salesforce", "quickbooks",
        "automation setup", "funnel building", "lead management",
        "appointment booking", "email marketing",
        "social media management", "facebook ads",
        "tiktok management", "bookkeeping", "data entry",
        "customer support",
        "asap", "urgently", "immediately",
      ],
      rejectTerms: [
        "i'm a virtual assistant",
        "i am a virtual assistant",
        "offering va services",
        "i provide va services",
        "looking for va work",
        "looking for a va job",
        "freelance va here",
      ],
      minTextLength: 20,
      minQuickScore: 15,
    },

    // Scoring weights used client-side for the quick score gate
    clientScoring: [
      { term: "hiring virtual assistant", weight: 40 },
      { term: "need a va", weight: 40 },
      { term: "looking for a va", weight: 40 },
      { term: "want to hire a va", weight: 40 },
      { term: "virtual assistant needed", weight: 40 },
      { term: "hiring va", weight: 40 },
      { term: "need someone to manage", weight: 30 },
      { term: "urgent va hire", weight: 30 },
      { term: "hiring immediately", weight: 30 },
      { term: "va recommendations", weight: 20 },
      { term: "best va service", weight: 20 },
      { term: "overwhelmed", weight: 15 },
      { term: "drowning in tasks", weight: 15 },
      { term: "gohighlevel", weight: 15 },
      { term: "zapier", weight: 15 },
      { term: "clickfunnels", weight: 15 },
      { term: "crm setup", weight: 15 },
    ],

    // Platform CSS selectors — self-healing fallback chains
    selectors: {
      Facebook: {
        feedContainer: ['[role="feed"]', '[data-pagelet*="Feed"]'],
        postNode: ['[role="article"]'],
        textContent: ['[dir="auto"]'],
        username: ['a[href*="/user/"]', 'a[href*="/profile"]', "h3 a", "h4 a"],
        postUrl: ['a[href*="/posts/"]', 'a[href*="/permalink/"]', 'a[href*="story_fbid"]'],
        engagement: ['[aria-label*="reaction"]', '[aria-label*="like"]'],
      },
      LinkedIn: {
        feedContainer: ['[role="main"]'],
        postNode: [".feed-shared-update-v2", "[data-urn]"],
        textContent: [".feed-shared-text", ".break-words", "[dir='ltr']"],
        username: [".feed-shared-actor__name", ".update-components-actor__name"],
        engagement: [".social-details-social-counts__reactions-count"],
      },
      Reddit: {
        feedContainer: ["#main-content", '[data-testid="subreddit-feed"]', ".ListingLayout-outerContainer"],
        postNode: ["shreddit-post", '[data-testid="post-container"]'],
        title: ['[data-testid="post-title"]', '[slot="title"]', "h1", "h3"],
        body: ['[data-testid="post-content"]', '[slot="text-body"]', ".md"],
        username: ['a[href*="/user/"]'],
        engagement: ['[data-testid="score"]'],
      },
      X: {
        feedContainer: ['[data-testid="primaryColumn"] section', '[aria-label*="Timeline"]'],
        postNode: ['article[data-testid="tweet"]'],
        textContent: ['[data-testid="tweetText"]'],
        username: ['[data-testid="User-Name"]'],
        engagement: ['[data-testid="like"] span', '[data-testid="unlike"] span'],
      },
    },

    // Rate limiting config
    rateLimits: {
      Facebook: 60,
      LinkedIn: 40,
      Reddit: 80,
      X: 50,
    },
  };

  return NextResponse.json(config, { status: 200 });
}
