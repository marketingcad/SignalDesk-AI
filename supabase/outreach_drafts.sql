-- ============================================================
-- Migration: outreach_drafts
-- Stores AI-generated outreach messages per lead so users don't
-- regenerate every time, and we keep a lightweight message history.
--
-- Feature: AI Outreach Drafts (docs/AI-OUTREACH-DRAFTS.md)
-- Run in the Supabase SQL Editor.
--
-- NOTE: channel/tone CHECK constraints are created together with the table,
-- so the app's allowed values and the DB constraint can never drift. If you
-- later add a new channel/tone, ship a matching ALTER in the SAME migration
-- or inserts will fail silently with Postgres error 23514.
-- ============================================================

create table if not exists public.outreach_drafts (
  id          uuid          primary key default gen_random_uuid(),
  lead_id     uuid          not null references public.leads(id) on delete cascade,
  channel     text          not null default 'comment' check (channel in ('comment', 'dm')),
  tone        text          not null default 'friendly' check (tone in ('friendly', 'professional', 'direct')),
  body        text          not null,
  created_by  text,         -- session user email
  copied_at   timestamptz,  -- set when the user hits Copy
  created_at  timestamptz   not null default now()
);

-- Latest-draft-per-lead lookups (newest first)
create index if not exists idx_outreach_drafts_lead_created_at
  on public.outreach_drafts (lead_id, created_at desc);

-- ──────────────────────────────────────────────────────────
-- RLS — service role bypasses; the API enforces auth via
--       verifySession + the service_role key in lib/supabase.ts.
-- ──────────────────────────────────────────────────────────
alter table public.outreach_drafts enable row level security;

create policy "Service role full access on outreach_drafts"
  on public.outreach_drafts for all
  using (true) with check (true);
