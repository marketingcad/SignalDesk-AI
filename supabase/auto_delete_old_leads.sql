-- ============================================================
-- Auto-delete leads where detected_at is older than 5 days.
-- Uses pg_cron (enabled by default on Supabase) to run daily.
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Enable pg_cron if not already enabled
create extension if not exists pg_cron;

-- 2. Create a function that deletes stale leads
create or replace function public.delete_old_leads()
returns void
language sql
as $$
  delete from public.leads
  where detected_at < now() - interval '5 days';
$$;

-- 3. Schedule the function to run once every day at midnight UTC
select cron.schedule(
  'delete-old-leads',       -- unique job name
  '0 0 * * *',              -- cron expression: daily at 00:00 UTC
  'select public.delete_old_leads()'
);
