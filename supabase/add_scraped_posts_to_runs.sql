-- ============================================================
-- Migration: add scraped_posts JSONB column to url_schedule_runs
-- Stores the list of individual posts found during each run,
-- enabling the UI to display post details per run execution.
-- ============================================================

alter table public.url_schedule_runs
  add column if not exists scraped_posts jsonb;

comment on column public.url_schedule_runs.scraped_posts is
  'Array of scraped posts found during this run. Each entry: {author, text, url, platform, timestamp, matchedKeywords[]}';
