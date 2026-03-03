import { supabase } from "./supabase";
import { classifyText, type PostClassification } from "./keywords";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUBREDDITS = "forhire+virtualassistant+remotework";
const USER_AGENT = "signal-desk-ai/1.0 (by /u/signal-desk-bot)";
const FETCH_LIMIT = 25;

// ---------------------------------------------------------------------------
// Step 1: Reddit OAuth2 — client_credentials flow
// ---------------------------------------------------------------------------

let cachedToken: { access_token: string; expires_at: number } | null = null;

export async function getRedditAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[reddit-monitor] REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required"
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[reddit-monitor] Token request failed: ${res.status} — ${text}`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Step 2: Fetch new posts from subreddits
// ---------------------------------------------------------------------------

export async function fetchNewPosts(token: string): Promise<RedditPost[]> {
  const url = `https://oauth.reddit.com/r/${SUBREDDITS}/new?limit=${FETCH_LIMIT}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[reddit-monitor] Fetch posts failed: ${res.status} — ${text}`
    );
  }

  const json = (await res.json()) as {
    data: {
      children: Array<{ data: Record<string, unknown> }>;
    };
  };

  return json.data.children.map((child) => ({
    id: child.data.id as string,
    title: (child.data.title as string) || "",
    selftext: (child.data.selftext as string) || "",
    author: (child.data.author as string) || "[deleted]",
    subreddit: (child.data.subreddit as string) || "",
    permalink: (child.data.permalink as string) || "",
    created_utc: (child.data.created_utc as number) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Step 3: Classify — combines title + body for detection
// ---------------------------------------------------------------------------

export function classifyRedditPost(
  title: string,
  body: string
): PostClassification {
  const combined = `${title} ${body}`;
  return classifyText(combined);
}

// ---------------------------------------------------------------------------
// Step 4: Supabase — duplicate check + insert
// ---------------------------------------------------------------------------

export async function isRedditDuplicate(
  reddit_post_id: string
): Promise<boolean> {
  const { data } = await supabase
    .from("reddit_post_logs")
    .select("id")
    .eq("reddit_post_id", reddit_post_id)
    .maybeSingle();

  return !!data;
}

export async function insertRedditPostLog(
  post: RedditPost,
  classification: PostClassification
): Promise<void> {
  const { error } = await supabase.from("reddit_post_logs").insert({
    reddit_post_id: post.id,
    subreddit: post.subreddit,
    author: post.author,
    title: post.title,
    body: post.selftext,
    classification,
    created_utc: new Date(post.created_utc * 1000).toISOString(),
    notified: true,
  });

  if (error) {
    console.error("[reddit-monitor] Supabase insert error:", error);
  }
}

// ---------------------------------------------------------------------------
// Step 5: Discord notification
// ---------------------------------------------------------------------------

export async function sendRedditDiscordNotification(
  post: RedditPost,
  classification: PostClassification
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[reddit-monitor] DISCORD_WEBHOOK_URL is not configured");
    return;
  }

  const emoji = classification === "HIRING_VA" ? "🟢" : "🔵";
  const label = classification === "HIRING_VA" ? "HIRING VA" : "SEEKING WORK";
  const preview = post.selftext.slice(0, 200) || "(no body)";
  const link = `https://reddit.com${post.permalink}`;

  const content = [
    `${emoji} **NEW ${label} POST**`,
    "",
    `📍 **Subreddit:** r/${post.subreddit}`,
    `👤 **Author:** u/${post.author}`,
    `📌 **Title:** ${post.title}`,
    `📝 **Preview:** ${preview}`,
    `🔗 **Link:** ${link}`,
  ].join("\n");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    console.error(
      `[reddit-monitor] Discord notification failed: ${res.status} ${res.statusText}`
    );
  }
}

// ---------------------------------------------------------------------------
// Step 6: Main monitor pipeline
// ---------------------------------------------------------------------------

export interface MonitorResult {
  fetched: number;
  classified: number;
  notified: number;
  skipped: number;
  errors: number;
}

export async function runRedditMonitor(): Promise<MonitorResult> {
  const result: MonitorResult = {
    fetched: 0,
    classified: 0,
    notified: 0,
    skipped: 0,
    errors: 0,
  };

  // Authenticate
  const token = await getRedditAccessToken();

  // Fetch latest posts
  const posts = await fetchNewPosts(token);
  result.fetched = posts.length;

  for (const post of posts) {
    try {
      // Idempotency — skip already-processed posts
      if (await isRedditDuplicate(post.id)) {
        result.skipped++;
        continue;
      }

      const classification = classifyRedditPost(post.title, post.selftext);

      if (classification) {
        result.classified++;

        // Discord notification
        await sendRedditDiscordNotification(post, classification);
        result.notified++;

        // Store in database
        await insertRedditPostLog(post, classification);

        console.log(
          `[reddit-monitor] Processed: ${post.id} → ${classification}`
        );
      }
    } catch (err) {
      result.errors++;
      console.error(
        `[reddit-monitor] Error processing post ${post.id}:`,
        err
      );
    }
  }

  return result;
}
