-- ============================================================
-- Migration: url_schedules & url_schedule_runs
-- Durable persistence for the scraper URL scheduler.
-- Replaces JSON file storage (url-schedules.json, url-schedule-runs.json).
--
-- Run in the Supabase SQL Editor (in order).
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. url_schedules
--    One row per scheduled scrape job configured from /scrape-url.
-- ──────────────────────────────────────────────────────────
create table if not exists public.url_schedules (
  id              uuid          primary key default gen_random_uuid(),
  name            text          not null,
  url             text          not null,
  cron            text          not null,
  status          text          not null default 'active'
                                check (status in ('active', 'paused')),
  last_run_at     timestamptz,
  last_run_status text          check (last_run_status in ('ok', 'error')),
  total_runs      integer       not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists idx_url_schedules_status
  on public.url_schedules (status);

create index if not exists idx_url_schedules_created_at
  on public.url_schedules (created_at);


-- ──────────────────────────────────────────────────────────
-- 2. url_schedule_runs
--    One row per execution of a URL schedule (manual or cron).
-- ──────────────────────────────────────────────────────────
create table if not exists public.url_schedule_runs (
  id              uuid          primary key default gen_random_uuid(),
  schedule_id     uuid          not null references public.url_schedules(id) on delete cascade,
  schedule_name   text,
  started_at      timestamptz   not null default now(),
  finished_at     timestamptz,
  status          text          not null default 'running'
                                check (status in ('ok', 'error', 'running')),
  posts_found     integer       not null default 0,
  leads_inserted  integer       not null default 0,
  error_message   text
);

create index if not exists idx_url_schedule_runs_schedule
  on public.url_schedule_runs (schedule_id, started_at desc);

create index if not exists idx_url_schedule_runs_started_at
  on public.url_schedule_runs (started_at desc);


-- ──────────────────────────────────────────────────────────
-- 3. Auto-trim old runs — keep only the last 500 per schedule
--    Runs as a trigger after each INSERT on url_schedule_runs.
-- ──────────────────────────────────────────────────────────
create or replace function public.trim_old_schedule_runs()
returns trigger as $$
begin
  delete from public.url_schedule_runs
  where id in (
    select id from public.url_schedule_runs
    where schedule_id = NEW.schedule_id
    order by started_at desc
    offset 500
  );
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_trim_schedule_runs on public.url_schedule_runs;
create trigger trg_trim_schedule_runs
  after insert on public.url_schedule_runs
  for each row execute function public.trim_old_schedule_runs();


-- ──────────────────────────────────────────────────────────
-- 4. RLS — service role bypasses; no user-level access needed
--    (scraper service uses service_role key)
-- ──────────────────────────────────────────────────────────
alter table public.url_schedules enable row level security;
alter table public.url_schedule_runs enable row level security;

-- Allow service role full access (default behavior, but explicit)
create policy "Service role full access on url_schedules"
  on public.url_schedules for all
  using (true) with check (true);

create policy "Service role full access on url_schedule_runs"
  on public.url_schedule_runs for all
  using (true) with check (true);
