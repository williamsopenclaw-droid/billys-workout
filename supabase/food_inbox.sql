-- Claude inbox (v46): meal SUGGESTIONS waiting for William to review in the app.
-- Run once in the Supabase dashboard → SQL Editor for project sqmkjgubujrkxygsukng.
-- Safe to re-run.
--
-- Every row belongs to one inbox key, and row-level security only lets a request
-- touch rows whose inbox_key matches its X-Inbox-Key header. The table holds
-- nothing but suggestions: the inbox key can add, read and remove suggestions,
-- and cannot see or change workout_state (the real log). No update policy exists.

create table if not exists public.food_inbox (
  id          uuid primary key default gen_random_uuid(),
  inbox_key   text not null check (char_length(inbox_key) between 20 and 100),
  payload     jsonb not null check (pg_column_size(payload) < 262144),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists food_inbox_key_idx on public.food_inbox (inbox_key);

alter table public.food_inbox enable row level security;

drop policy if exists "inbox: add with own key" on public.food_inbox;
create policy "inbox: add with own key" on public.food_inbox for insert to anon
  with check (inbox_key = current_setting('request.headers', true)::json ->> 'x-inbox-key');

drop policy if exists "inbox: read own" on public.food_inbox;
create policy "inbox: read own" on public.food_inbox for select to anon
  using (inbox_key = current_setting('request.headers', true)::json ->> 'x-inbox-key');

drop policy if exists "inbox: remove own" on public.food_inbox;
create policy "inbox: remove own" on public.food_inbox for delete to anon
  using (inbox_key = current_setting('request.headers', true)::json ->> 'x-inbox-key');

grant select, insert, delete on public.food_inbox to anon;
