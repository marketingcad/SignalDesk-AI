-- ============================================================
-- Supabase migration: users.role (authorization layer)
-- Adds a role column so admin-only routes (user management,
-- account creation) can enforce privilege separation.
-- Run this in the Supabase SQL Editor (idempotent).
-- ============================================================

-- Role column. Defaults to the least-privileged 'member'.
alter table public.users
  add column if not exists role text not null default 'member'
    check (role in ('admin', 'member'));

create index if not exists idx_users_role
  on public.users (role);

-- ------------------------------------------------------------
-- REQUIRED: promote your administrator account(s).
-- Until at least one user is set to 'admin', every /api/admin/*
-- route and signup will return 403 Forbidden (fail-closed).
-- Replace the email below with your admin's email and run it.
-- ------------------------------------------------------------
-- update public.users set role = 'admin' where email = 'you@example.com';
