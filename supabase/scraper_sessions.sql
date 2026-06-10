-- Durable storage for the scraper's logged-in browser session.
--
-- Replaces the ephemeral-disk + BROWSER_STORAGE_STATE-env workflow: the scraper
-- loads the session from here on boot and re-saves the refreshed cookies after
-- every scrape, so a redeploy never loses the login and you never re-paste.
--
-- Accessed only by the scraper service via the Supabase service-role key, which
-- bypasses RLS — no policies needed. Do NOT expose this table to client keys
-- (it holds live session cookies).

create table if not exists public.scraper_sessions (
  id            text primary key,            -- 'default' (single shared session)
  storage_state jsonb not null,              -- Playwright storageState (cookies + localStorage)
  updated_at    timestamptz not null default now()
);

-- Lock the table to the service-role key only. RLS with NO policies blocks the
-- anon/authenticated roles entirely (so the public anon key cannot read the
-- session cookies); the scraper's service-role key bypasses RLS and still works.
alter table public.scraper_sessions enable row level security;
