-- ============================================================
-- Supabase schema: leads
-- Run this in the Supabase SQL Editor to create the table.
-- ============================================================

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null check (platform in ('Facebook', 'LinkedIn', 'Reddit', 'X', 'Other')),
  source           text not null,
  username         text not null,
  text             text not null,
  url              text not null,
  intent_score     integer not null default 0,
  intent_level     text not null check (intent_level in ('High', 'Medium', 'Low')),
  intent_category  text not null check (intent_category in (
    'Direct Hiring', 'Recommendation Request', 'Budget Inquiry',
    'Delegation Signal', 'Technical VA Request'
  )),
  status           text not null default 'New' check (status in ('New', 'Contacted', 'Qualified', 'Dismissed')),
  engagement       integer not null default 0,
  location         text,
  matched_keywords text[] not null default '{}',
  detected_at      timestamptz not null default now(),
  assigned_to      text,
  user_id          uuid references public.users(id),
  created_at       timestamptz not null default now()
);

-- Deduplication by URL
create unique index if not exists idx_leads_url
  on public.leads (url);

-- Filtering by platform
create index if not exists idx_leads_platform
  on public.leads (platform);

-- Filtering by intent level
create index if not exists idx_leads_intent_level
  on public.leads (intent_level);

-- Filtering by status
create index if not exists idx_leads_status
  on public.leads (status);

-- Chronological queries (dashboard, reports)
create index if not exists idx_leads_created_at
  on public.leads (created_at desc);

-- Intent score ranking
create index if not exists idx_leads_intent_score_desc
  on public.leads (intent_score desc);
