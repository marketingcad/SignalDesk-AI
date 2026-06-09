-- ============================================================
-- Supabase migration: pipeline_stage / stage_position on leads
-- Adds Kanban pipeline columns to public.leads.
-- Run this in the Supabase SQL Editor (idempotent).
-- ============================================================

-- Pipeline stage (Kanban column the lead currently lives in)
alter table public.leads
  add column if not exists pipeline_stage text not null default 'New Leads'
    check (pipeline_stage in ('New Leads', 'Engaged', 'Proposal Sent', 'Won', 'Lost'));

-- Ordering position within a pipeline stage column
alter table public.leads
  add column if not exists stage_position double precision not null default 0;

-- Pipeline board queries (group by stage, ordered within column)
create index if not exists idx_leads_pipeline_stage_position
  on public.leads (pipeline_stage, stage_position);

-- Ensure realtime DELETE payloads carry all column values (not just the PK),
-- so subscribers (pipeline board, sidebar alert count) can read old.* fields.
-- Idempotent and safe to re-run.
alter table public.leads replica identity full;
