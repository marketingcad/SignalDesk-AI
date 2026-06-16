-- ============================================================
-- Migration: bookmarks
-- Durable persistence for saved URLs from /bookmarks.
-- Replaces JSON file storage (scraper-service/storage/bookmarks.json).
--
-- Run in the Supabase SQL Editor.
-- ============================================================

create table if not exists public.bookmarks (
  id          uuid          primary key default gen_random_uuid(),
  url         text          not null,
  name        text          not null,
  platform    text          check (platform in ('Facebook', 'LinkedIn', 'Reddit', 'X', 'Other')),
  notes       text          not null default '',
  favorite    boolean       not null default false,
  user_id     uuid          references public.users(id) on delete cascade,
  created_at  timestamptz   not null default now()
);

-- Per-user listing, newest first (dashboard default sort)
create index if not exists idx_bookmarks_user_created_at
  on public.bookmarks (user_id, created_at desc);

-- Prevent the same user from saving a URL twice
create unique index if not exists idx_bookmarks_user_url
  on public.bookmarks (user_id, url);

-- Filtering by platform
create index if not exists idx_bookmarks_platform
  on public.bookmarks (platform);


-- ──────────────────────────────────────────────────────────
-- RLS — service role bypasses; API enforces per-user scoping
--       via the service_role key in lib/supabase.ts.
-- ──────────────────────────────────────────────────────────
alter table public.bookmarks enable row level security;

create policy "Service role full access on bookmarks"
  on public.bookmarks for all
  using (true) with check (true);
