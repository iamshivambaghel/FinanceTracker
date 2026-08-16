-- FinanceTracker — Supabase schema for cloud sync.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.
--
-- Model: one JSONB document per user holding their entire app state.
-- Row Level Security guarantees each signed-in user can only read/write
-- their own row, even though the anon key is public in the browser.

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Drop-and-recreate policies so re-running this file is safe.
drop policy if exists "read own state"   on public.app_state;
drop policy if exists "insert own state" on public.app_state;
drop policy if exists "update own state" on public.app_state;

create policy "read own state"   on public.app_state
  for select using (auth.uid() = user_id);
create policy "insert own state" on public.app_state
  for insert with check (auth.uid() = user_id);
create policy "update own state" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
