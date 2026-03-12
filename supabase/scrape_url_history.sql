-- ============================================================
-- Migration: scrape_url_history & scraped_posts
-- Tracks every URL scrape session and the individual posts
-- discovered, including which keywords triggered detection.
--
-- Run in the Supabase SQL Editor (in order).
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. scrape_url_sessions
--    One row per "Scrape" button press on /scrape-url.
-- ──────────────────────────────────────────────────────────
create table if not exists public.scrape_url_sessions (
  id              uuid        primary key default gen_random_uuid(),

  -- The URL the user submitted
  scraped_url     text        not null,

  -- Platform detected by the scraper service (Facebook, LinkedIn, Reddit, X)
  platform        text        check (platform in ('Facebook', 'LinkedIn', 'Reddit', 'X', 'Other')),

  -- Outcome counters
  posts_found     integer     not null default 0,
  posts_inserted  integer     not null default 0,
  duplicates      integer     not null default 0,

  -- Error message when the scrape fails (null = success)
  error_message   text,

  -- Whether the session completed successfully
  success         boolean     not null default false,

  -- The dashboard user who triggered the scrape
  user_id         uuid        references public.users(id),

  -- When the scrape was initiated
  scraped_at      timestamptz not null default now()
);

-- Index: list sessions newest-first per user
create index if not exists idx_scrape_sessions_user_at
  on public.scrape_url_sessions (user_id, scraped_at desc);

-- Index: filter by platform
create index if not exists idx_scrape_sessions_platform
  on public.scrape_url_sessions (platform);

-- Index: filter by success/failure
create index if not exists idx_scrape_sessions_success
  on public.scrape_url_sessions (success);

-- Index: chronological dashboard listing
create index if not exists idx_scrape_sessions_scraped_at
  on public.scrape_url_sessions (scraped_at desc);


-- ──────────────────────────────────────────────────────────
-- 2. scraped_posts
--    One row per individual post returned by the scraper.
--    Linked back to the session that discovered it.
-- ──────────────────────────────────────────────────────────
create table if not exists public.scraped_posts (
  id                uuid        primary key default gen_random_uuid(),

  -- Foreign key to the session that found this post
  session_id        uuid        not null references public.scrape_url_sessions(id) on delete cascade,

  -- Post content
  author            text        not null,
  description       text        not null,          -- full post text / caption
  post_url          text        not null,           -- direct link to the post

  -- Platform the post belongs to
  platform          text        check (platform in ('Facebook', 'LinkedIn', 'Reddit', 'X', 'Other')),

  -- Date & time the post was originally published (may be null if scraper can't detect it)
  post_date         timestamptz,

  -- Keywords from the user's keyword list that matched this post
  -- e.g. '{"hire", "virtual assistant", "looking for VA"}'
  matched_keywords  text[]      not null default '{}',

  -- Optional: link to the lead record created for this post (if it passed intent scoring)
  lead_id           uuid        references public.leads(id) on delete set null,

  -- Whether this post was a duplicate (already existed in leads)
  is_duplicate      boolean     not null default false,

  -- When this row was recorded
  created_at        timestamptz not null default now()
);

-- Deduplication: same post URL can only appear once across all sessions
create unique index if not exists idx_scraped_posts_url
  on public.scraped_posts (post_url);

-- Index: fetch all posts for a given session (most common query)
create index if not exists idx_scraped_posts_session
  on public.scraped_posts (session_id);

-- Index: filter by platform
create index if not exists idx_scraped_posts_platform
  on public.scraped_posts (platform);

-- Index: filter by author
create index if not exists idx_scraped_posts_author
  on public.scraped_posts (author);

-- Index: chronological listing
create index if not exists idx_scraped_posts_created_at
  on public.scraped_posts (created_at desc);

-- Index: GIN index for fast keyword array search
--   e.g. WHERE matched_keywords @> ARRAY['hire']
create index if not exists idx_scraped_posts_keywords
  on public.scraped_posts using gin (matched_keywords);

-- Index: only non-duplicate posts (new leads)
create index if not exists idx_scraped_posts_not_duplicate
  on public.scraped_posts (is_duplicate)
  where is_duplicate = false;


-- ──────────────────────────────────────────────────────────
-- 3. Row Level Security
--    Users can only see sessions and posts they created.
-- ──────────────────────────────────────────────────────────
alter table public.scrape_url_sessions enable row level security;

create policy "Users see own scrape sessions"
  on public.scrape_url_sessions
  for all
  using (auth.uid() = user_id);

alter table public.scraped_posts enable row level security;

create policy "Users see posts from own sessions"
  on public.scraped_posts
  for all
  using (
    session_id in (
      select id from public.scrape_url_sessions
      where user_id = auth.uid()
    )
  );


-- ──────────────────────────────────────────────────────────
-- 4. Convenience view: session summary with post counts
-- ──────────────────────────────────────────────────────────
create or replace view public.v_scrape_session_summary as
select
  s.id,
  s.scraped_url,
  s.platform,
  s.posts_found,
  s.posts_inserted,
  s.duplicates,
  s.success,
  s.error_message,
  s.user_id,
  s.scraped_at,
  count(p.id)                                         as total_posts_stored,
  count(p.id) filter (where not p.is_duplicate)       as new_posts,
  array_agg(distinct kw) filter (where kw is not null) as all_matched_keywords
from public.scrape_url_sessions s
left join public.scraped_posts p on p.session_id = s.id
left join lateral unnest(p.matched_keywords) as kw on true
group by s.id;
