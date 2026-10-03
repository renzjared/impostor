-- Run this in the Supabase SQL Editor. Enable Anonymous Sign-Ins and Discord
-- OAuth in Authentication > Providers. Never put a service-role key in the app.
create extension if not exists pgcrypto;

create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9]{1,20}$'),
  name text not null check (length(name) between 1 and 30),
  is_public boolean not null default false,
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','playing','voting','results','ended')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists lobbies_code_case_insensitive_idx on public.lobbies (lower(code));

create table if not exists public.lobby_roles (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  is_impostor boolean not null,
  word text not null,
  hint text not null,
  primary key (lobby_id, player_id)
);

create table if not exists public.booster_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 50),
  words jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booster_words_array check (jsonb_typeof(words) = 'array')
);

alter table public.lobbies enable row level security;
alter table public.lobby_roles enable row level security;
alter table public.booster_packs enable row level security;

drop policy if exists "Public lobbies and lobby members can read rooms" on public.lobbies;
create policy "Public lobbies and lobby members can read rooms" on public.lobbies
  for select to authenticated using (
    is_public or host_id = auth.uid()
    or coalesce(state->'players', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  );
drop policy if exists "Authenticated users create their own rooms" on public.lobbies;
create policy "Authenticated users create their own rooms" on public.lobbies
  for insert to authenticated with check (host_id = auth.uid());
drop policy if exists "Room members update room state" on public.lobbies;
create policy "Room members update room state" on public.lobbies
  for update to authenticated using (
    host_id = auth.uid()
    or coalesce(state->'players', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  ) with check (
    host_id = auth.uid()
    or coalesce(state->'players', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  );
drop policy if exists "Room hosts delete rooms" on public.lobbies;
create policy "Room hosts delete rooms" on public.lobbies for delete to authenticated using (host_id = auth.uid());

drop policy if exists "Players read only their own role" on public.lobby_roles;
create policy "Players read only their own role" on public.lobby_roles
  for select to authenticated using (player_id = auth.uid());
drop policy if exists "Room hosts assign roles" on public.lobby_roles;
create policy "Room hosts assign roles" on public.lobby_roles
  for insert to authenticated with check (
    exists (select 1 from public.lobbies where id = lobby_id and host_id = auth.uid())
  );
drop policy if exists "Room hosts update roles" on public.lobby_roles;
create policy "Room hosts update roles" on public.lobby_roles
  for update to authenticated using (
    exists (select 1 from public.lobbies where id = lobby_id and host_id = auth.uid())
  ) with check (
    exists (select 1 from public.lobbies where id = lobby_id and host_id = auth.uid())
  );
drop policy if exists "Room hosts delete roles" on public.lobby_roles;
create policy "Room hosts delete roles" on public.lobby_roles
  for delete to authenticated using (
    exists (select 1 from public.lobbies where id = lobby_id and host_id = auth.uid())
  );

drop policy if exists "Anyone can browse booster packs" on public.booster_packs;
create policy "Anyone can browse booster packs" on public.booster_packs
  for select to authenticated using (true);
drop policy if exists "Creators manage their own booster packs" on public.booster_packs;
create policy "Creators manage their own booster packs" on public.booster_packs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.join_lobby(p_code text, p_nickname text, p_user_id uuid)
returns setof public.lobbies
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_room public.lobbies;
  new_player jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Please sign in before joining a room';
  end if;
  if length(trim(p_nickname)) = 0 or length(p_nickname) > 32 then
    raise exception 'Display name must contain 1 to 32 characters';
  end if;
  if trim(p_code) !~ '^[A-Za-z0-9]{1,20}$' then raise exception 'Invalid room code'; end if;
  select * into found_room from public.lobbies
    where lower(code) = lower(trim(p_code)) and status = 'lobby' for update;
  if not found then raise exception 'Room not found or game already started'; end if;
  if found_room.state->>'mode' <> 'personal-devices' then raise exception 'This room uses pass-and-play and cannot be joined remotely'; end if;
  if jsonb_array_length(coalesce(found_room.state->'players', '[]'::jsonb)) >= 12
     and not (coalesce(found_room.state->'players', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))) then
    raise exception 'This room is full';
  end if;
  new_player := jsonb_build_object(
    'id', p_user_id::text, 'name', trim(p_nickname),
    'avatar', (array['🦊','🐸','🐼','🐙','🦋','🐨','🦄','🐯','🐻','🐧','🐰','🦝'])[1 + floor(random() * 12)::int],
    'ready', false, 'alive', true
  );
  update public.lobbies set state = jsonb_set(
    found_room.state, '{players}',
    case
      when coalesce(found_room.state->'players', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))
        then found_room.state->'players'
      else coalesce(found_room.state->'players', '[]'::jsonb) || jsonb_build_array(new_player)
    end
  ) where id = found_room.id returning * into found_room;
  return next found_room;
end;
$$;
revoke all on function public.join_lobby(text, text, uuid) from public;
grant execute on function public.join_lobby(text, text, uuid) to authenticated;

create or replace function public.resolve_lobby_vote(p_lobby_id uuid)
returns table (id uuid, code text, name text, state jsonb, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_room public.lobbies;
  winning_vote text;
  winning_vote_count bigint := 0;
  max_vote_count bigint;
  eliminated_id text;
  eliminated_is_impostor boolean;
  remaining_impostors bigint;
  remaining_civilians bigint;
  game_winner text;
  next_status text;
  next_players jsonb;
  next_state jsonb;
  secret_word text;
  secret_hint text;
  impostor_ids jsonb;
begin
  select * into current_room from public.lobbies
    where public.lobbies.id = p_lobby_id for update;
  if not found then raise exception 'Room not found'; end if;
  if current_room.host_id <> auth.uid() then raise exception 'Only the host can resolve the vote'; end if;
  if current_room.status <> 'voting' then raise exception 'This lobby is not voting'; end if;

  select max(grouped_votes.vote_count) into max_vote_count
  from (
    select count(*) as vote_count
    from jsonb_each_text(coalesce(current_room.state->'votes', '{}'::jsonb))
    group by value
  ) as grouped_votes;

  if max_vote_count is not null then
    select count(*) into winning_vote_count
    from (
      select value
      from jsonb_each_text(coalesce(current_room.state->'votes', '{}'::jsonb))
      group by value
      having count(*) = max_vote_count
    ) as tied_votes;
  end if;

  if winning_vote_count = 1 then
    select cast_votes.value into winning_vote
    from jsonb_each_text(coalesce(current_room.state->'votes', '{}'::jsonb)) as cast_votes(key, value)
    group by cast_votes.value
    having count(*) = max_vote_count
    limit 1;
    if winning_vote <> 'skip' then eliminated_id := winning_vote; end if;
  end if;

  if eliminated_id is not null then
    select assigned_role.is_impostor into eliminated_is_impostor
    from public.lobby_roles as assigned_role
    where assigned_role.lobby_id = p_lobby_id
      and assigned_role.player_id::text = eliminated_id;
    if eliminated_is_impostor is null then raise exception 'Could not verify the eliminated player role'; end if;
  end if;

  select coalesce(jsonb_agg(
    case when eliminated_id is not null and player.value->>'id' = eliminated_id
      then jsonb_set(player.value, '{alive}', 'false'::jsonb)
      else player.value end
    order by player.ordinality
  ), '[]'::jsonb)
  into next_players
  from jsonb_array_elements(coalesce(current_room.state->'players', '[]'::jsonb))
    with ordinality as player(value, ordinality);

  select count(*) filter (where assigned_role.is_impostor), count(*) filter (where not assigned_role.is_impostor)
  into remaining_impostors, remaining_civilians
  from public.lobby_roles as assigned_role
  where assigned_role.lobby_id = p_lobby_id
    and exists (
      select 1 from jsonb_array_elements(next_players) as player(value)
      where player.value->>'id' = assigned_role.player_id::text
        and coalesce((player.value->>'alive')::boolean, true)
    );

  if remaining_impostors = 0 then game_winner := 'civilians';
  elsif remaining_impostors >= remaining_civilians then game_winner := 'impostor';
  end if;
  next_status := case when game_winner is null then 'results' else 'ended' end;
  next_state := (current_room.state - 'word' - 'hint' - 'impostors' - 'winner') || jsonb_build_object(
    'players', next_players,
    'status', next_status,
    'eliminatedId', eliminated_id,
    'eliminatedWasImpostor', eliminated_is_impostor,
    'winner', game_winner
  );

  if game_winner is not null then
    select assigned_role.word into secret_word
    from public.lobby_roles as assigned_role where assigned_role.lobby_id = p_lobby_id limit 1;
    select assigned_role.hint into secret_hint
    from public.lobby_roles as assigned_role where assigned_role.lobby_id = p_lobby_id and assigned_role.is_impostor limit 1;
    select coalesce(jsonb_agg(assigned_role.player_id::text), '[]'::jsonb) into impostor_ids
    from public.lobby_roles as assigned_role where assigned_role.lobby_id = p_lobby_id and assigned_role.is_impostor;
    next_state := next_state || jsonb_build_object(
      'word', secret_word, 'hint', secret_hint, 'impostors', impostor_ids
    );
  end if;

  return query update public.lobbies as lobby
    set state = next_state, status = next_status
    where lobby.id = p_lobby_id
    returning lobby.id, lobby.code, lobby.name, lobby.state, lobby.status;
end;
$$;
revoke all on function public.resolve_lobby_vote(uuid) from public;
grant execute on function public.resolve_lobby_vote(uuid) to authenticated;

grant select, insert, update, delete on public.lobbies to authenticated;
grant select, insert, update, delete on public.lobby_roles to authenticated;
grant select, insert, update, delete on public.booster_packs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Enable Postgres Changes for the Supabase Realtime client.
do $$
begin
  alter publication supabase_realtime add table public.lobbies;
exception when duplicate_object then null;
end $$;
