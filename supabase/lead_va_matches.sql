-- ============================================================
-- Migration: lead_va_matches
-- Caches the VAs that Linkage VA Hub returned for a lead, so we
-- can enrich outreach drafts without re-hitting /api/match-vas.
--
-- Feature: Smart VA Matching (see the Integration Spec in README.md)
-- Run in the Supabase SQL Editor.
--
-- NOTE: profile_url carries ?src=signaldesk&lead=<id> and is the ONLY
-- call-to-action link. Never store or surface VA email/phone/portfolio —
-- the API does not return them, and the funnel depends on it staying that way.
-- ============================================================

create table if not exists public.lead_va_matches (
  id                  uuid              primary key default gen_random_uuid(),
  lead_id             uuid              not null references public.leads(id) on delete cascade,
  va_slug             text              not null,
  display_name        text              not null,  -- "Maria S." — never a full last name
  headshot_url        text,
  skills              text[]            not null default '{}',
  years_of_experience integer,
  availability        text,             -- available-now | available-in-two-weeks | available-in-one-months
  profile_url         text              not null,
  match_score         double precision  not null,
  created_at          timestamptz       not null default now(),
  updated_at          timestamptz       not null default now(),

  -- Re-running a match for the same lead upserts rather than duplicating.
  unique (lead_id, va_slug)
);

-- Top-match-per-lead lookups (best score first)
create index if not exists idx_lead_va_matches_lead_score
  on public.lead_va_matches (lead_id, match_score desc);

-- ──────────────────────────────────────────────────────────
-- RLS — the parent `leads` table has RLS DISABLED, so this table
--       inherits no convention. Enable it explicitly: the join of
--       VA identity to lead identity is more sensitive than either
--       table alone. Service role bypasses RLS; the app only ever
--       reaches this table via the service_role key in lib/supabase.ts.
-- ──────────────────────────────────────────────────────────
alter table public.lead_va_matches enable row level security;

create policy "Service role full access on lead_va_matches"
  on public.lead_va_matches for all
  using (true) with check (true);
