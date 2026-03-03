-- ============================================================
-- Supabase schema: reddit_post_logs
-- Run this in the Supabase SQL Editor to create the table.
-- ============================================================

create table if not exists public.reddit_post_logs (
  id              uuid primary key default gen_random_uuid(),
  reddit_post_id  text not null unique,
  subreddit       text not null,
  author          text not null,
  title           text,
  body            text,
  classification  text not null check (classification in ('HIRING_VA', 'SEEKING_WORK')),
  created_utc     timestamptz,
  notified        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Index for duplicate-check lookups
create index if not exists idx_reddit_post_logs_reddit_post_id
  on public.reddit_post_logs (reddit_post_id);

-- Index for filtering by classification
create index if not exists idx_reddit_post_logs_classification
  on public.reddit_post_logs (classification);

-- Index for chronological queries
create index if not exists idx_reddit_post_logs_created_at
  on public.reddit_post_logs (created_at desc);

-- Index for subreddit filtering
create index if not exists idx_reddit_post_logs_subreddit
  on public.reddit_post_logs (subreddit);
