-- Iron Fist Academy: optional public leaderboard. Paste into Supabase → SQL Editor → Run.
-- Each joined player has a private random key (made in the app). Only name and points are public.
-- The table itself is locked; the app uses the functions below.

create table if not exists public.leaderboard (
  key text primary key check (char_length(key) = 26),
  name text not null check (char_length(name) between 1 and 20),
  points integer not null check (points between 0 and 1000000),
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security; -- no policies: no direct access
revoke all on public.leaderboard from anon, authenticated;

create or replace function public.board_submit(p_key text, p_name text, p_points integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(p_key) <> 26 then raise exception 'bad key'; end if;
  if char_length(trim(p_name)) < 1 or char_length(p_name) > 20 then raise exception 'bad name'; end if;
  if p_points < 0 or p_points > 1000000 then raise exception 'bad points'; end if;
  insert into public.leaderboard (key, name, points, updated_at) values (p_key, trim(p_name), p_points, now())
  on conflict (key) do update set name = excluded.name, points = excluded.points, updated_at = now();
end $$;

create or replace function public.board_top()
returns table (name text, points integer, updated_at timestamptz)
language sql security definer set search_path = public stable as $$
  select l.name, l.points, l.updated_at from public.leaderboard l order by l.points desc, l.updated_at asc limit 100
$$;

create or replace function public.board_place(p_key text)
returns table (place bigint, players bigint)
language sql security definer set search_path = public stable as $$
  select (select count(*) from public.leaderboard o where o.points > m.points) + 1, (select count(*) from public.leaderboard)
  from public.leaderboard m where m.key = p_key
$$;

create or replace function public.board_leave(p_key text)
returns void language sql security definer set search_path = public as $$
  delete from public.leaderboard where key = p_key
$$;

revoke all on function public.board_submit(text, text, integer) from public;
revoke all on function public.board_top() from public;
revoke all on function public.board_place(text) from public;
revoke all on function public.board_leave(text) from public;
grant execute on function public.board_submit(text, text, integer) to anon, authenticated;
grant execute on function public.board_top() to anon, authenticated;
grant execute on function public.board_place(text) to anon, authenticated;
grant execute on function public.board_leave(text) to anon, authenticated;
