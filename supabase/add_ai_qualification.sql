-- ============================================================
-- Add AI qualification column to leads table
-- Run this in the Supabase SQL Editor after the initial schema.
-- ============================================================

alter table public.leads
  add column if not exists ai_qualification jsonb;

comment on column public.leads.ai_qualification is
  'Full AI qualification result from Gemini (JSON): isHiring, intentCategory, leadScore, urgency, tasks, skills, tools, industry, budgetEstimate, spamRisk, spamReason, leadSummary';
