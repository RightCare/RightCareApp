-- RightCare — consults schema (step 1)
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

create table if not exists public.consults (
  id           uuid primary key default gen_random_uuid(),

  -- Human-facing consult id shown in the app / QR (e.g. "PC-4KD9Q2").
  consult_ref  text not null unique,

  -- Short unguessable code the caller receives, used later to claim the
  -- consult in the app. Kept separate from consult_ref on purpose.
  access_code  text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),

  -- Where the consult came from: 'app' today, 'phone' once telephony lands.
  source       text not null default 'app',

  -- Patient details.
  name         text not null,
  dob          text not null,
  sex          text,
  age          int,

  -- Outcome.
  outcome         text not null,          -- 'Pharmacist consultation — X' | 'GP referral'
  medication      text,
  referral_reason text,
  query           text,

  -- The triage Q&A, stored as [{ "q": "...", "a": "..." }].
  answers      jsonb not null default '[]'::jsonb,

  -- Set once a logged-in user claims this consult (step 2 / auth).
  claimed_by   uuid references auth.users (id),

  created_at   timestamptz not null default now()
);

create index if not exists consults_access_code_idx on public.consults (access_code);
create index if not exists consults_created_at_idx  on public.consults (created_at desc);

-- ── Row-level security ───────────────────────────────────────────────
-- Step 1 posture: the app (anon key) may INSERT a consult, but may NOT
-- read the table back — reads happen server-side (service_role) for now,
-- and move behind auth in step 2. This means a leaked anon key cannot be
-- used to enumerate anyone's health data.
alter table public.consults enable row level security;

drop policy if exists "anon can insert consults" on public.consults;
create policy "anon can insert consults"
  on public.consults for insert
  to anon, authenticated
  with check (true);

-- (No SELECT/UPDATE/DELETE policy for anon => those are denied by default.)
-- Authenticated users can read consults they have claimed (used in step 2).
drop policy if exists "users read own consults" on public.consults;
create policy "users read own consults"
  on public.consults for select
  to authenticated
  using (claimed_by = auth.uid());
