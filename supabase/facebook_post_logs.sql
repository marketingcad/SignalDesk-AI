-- ============================================================
-- Supabase schema: facebook_post_logs
-- Run this in the Supabase SQL Editor to create the table.
-- ============================================================

create table if not exists public.facebook_post_logs (
  id            uuid primary key default gen_random_uuid(),
  group_id      text not null,
  post_id       text not null unique,
  author_name   text not null,
  message       text,
  classification text not null check (classification in ('HIRING_VA', 'SEEKING_WORK')),
  created_time  text,
  notified      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Index for duplicate-check lookups
create index if not exists idx_facebook_post_logs_post_id
  on public.facebook_post_logs (post_id);

-- Index for filtering by classification
create index if not exists idx_facebook_post_logs_classification
  on public.facebook_post_logs (classification);

-- Index for chronological queries
create index if not exists idx_facebook_post_logs_created_at
  on public.facebook_post_logs (created_at desc);

-- Row Level Security (optional — enable if you want to restrict access)
-- alter table public.facebook_post_logs enable row level security;
