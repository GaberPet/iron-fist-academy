-- Iron Fist Academy: progress sync. Paste this whole file into Supabase → SQL Editor → Run.
-- Each synced player has a long random sync code (made in the app). The table itself is locked:
-- nobody can list or read it. The app only calls the two functions below, which need the exact
-- code, so a code works like a password for that one player's progress.

create table if not exists public.sync (
  code text primary key check (char_length(code) between 24 and 64),
  player text not null default '',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sync enable row level security; -- no policies: no direct access at all
revoke all on public.sync from anon, authenticated;

create or replace function public.sync_pull(p_code text)
returns table (player text, data jsonb, updated_at timestamptz)
language sql security definer set search_path = public
as $$ select s.player, s.data, s.updated_at from public.sync s where s.code = p_code $$;

create or replace function public.sync_push(p_code text, p_player text, p_data jsonb)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare t timestamptz := now();
begin
  if char_length(p_code) < 24 or char_length(p_code) > 64 then raise exception 'bad code'; end if;
  if octet_length(p_data::text) > 2000000 then raise exception 'progress too large'; end if;
  insert into public.sync (code, player, data, updated_at) values (p_code, left(p_player, 32), p_data, t)
  on conflict (code) do update set player = excluded.player, data = excluded.data, updated_at = t;
  return t;
end $$;

revoke all on function public.sync_pull(text) from public;
revoke all on function public.sync_push(text, text, jsonb) from public;
grant execute on function public.sync_pull(text) to anon, authenticated;
grant execute on function public.sync_push(text, text, jsonb) to anon, authenticated;
