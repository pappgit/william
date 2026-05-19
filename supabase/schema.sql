-- Kjør i Supabase: SQL Editor → New query → Run

create table if not exists public.gressklipp_data (
  room_id text primary key,
  addresses jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gressklipp_data enable row level security;

-- Familie-app: anon-nøkkel i klient, «hemmelig» room_id i config
create policy "gressklipp_read" on public.gressklipp_data
  for select to anon, authenticated using (true);

create policy "gressklipp_write" on public.gressklipp_data
  for insert to anon, authenticated with check (true);

create policy "gressklipp_update" on public.gressklipp_data
  for update to anon, authenticated using (true);

-- Realtime: Database → Replication → slå på for gressklipp_data
-- (eller kjør linjen under hvis den ikke allerede er aktiv)
-- alter publication supabase_realtime add table public.gressklipp_data;
