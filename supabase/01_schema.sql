-- Run first in the Supabase SQL Editor.
-- Defines the schema and database behavior used by the Priorities app.

begin;

-- Remove the obsolete Auth trigger that references the missing priorities_profiles table.
drop trigger if exists priorities_profile_on_auth_user_created on auth.users;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text not null default 'Valeurs',
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host_id uuid,
  status text not null default 'LOBBY'
    check (status in ('LOBBY', 'RANKING', 'GUESSING', 'REVEAL', 'RESULTS', 'FINISHED')),
  round_number integer not null default 1 check (round_number > 0),
  created_at timestamptz not null default now()
);

-- Upgrade installations created before GUESSING, RESULTS and REVEAL were introduced.
do $$
declare
  status_constraint record;
  status_type "char";
begin
  for status_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.games'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.games drop constraint %I',
      status_constraint.conname
    );
  end loop;

  select type.typtype
  into status_type
  from pg_attribute as attribute
  join pg_type as type on type.oid = attribute.atttypid
  where attribute.attrelid = 'public.games'::regclass
    and attribute.attname = 'status'
    and not attribute.attisdropped;

  if status_type = 'e' then
    alter table public.games alter column status drop default;
    alter table public.games
      alter column status type text
      using status::text;
    alter table public.games alter column status set default 'LOBBY';
  end if;

  alter table public.games
    add constraint games_status_supported_check
    check (status in ('LOBBY', 'RANKING', 'GUESSING', 'REVEAL', 'RESULTS', 'FINISHED'));
end;
$$;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 15),
  avatar_url text,
  score integer not null default 0,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.players
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;
alter table public.players
  add column if not exists score integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_host_id_fkey'
  ) then
    alter table public.games
      add constraint games_host_id_fkey
      foreign key (host_id) references public.players (id) on delete set null;
  end if;
end;
$$;

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round_index integer not null check (round_index > 0),
  created_at timestamptz not null default now(),
  unique (game_id, round_index)
);

create table if not exists public.round_cards (
  round_id uuid not null references public.rounds (id) on delete cascade,
  card_id uuid not null references public.cards (id),
  position smallint not null check (position between 1 and 5),
  primary key (round_id, card_id),
  unique (round_id, position)
);

create index if not exists round_cards_card_id_idx
  on public.round_cards (card_id);

create table if not exists public.player_rankings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  ranking jsonb not null
    check (
      case
        when jsonb_typeof(ranking) = 'array'
          then jsonb_array_length(ranking) = 5
        else false
      end
    ),
  is_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table if not exists public.round_reveals (
  round_id uuid primary key references public.rounds (id) on delete cascade,
  controller_player_id uuid not null references public.players (id) on delete cascade,
  revealed_count integer not null default 0 check (revealed_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.round_reveals
  drop constraint if exists round_reveals_revealed_count_check;
alter table public.round_reveals
  add constraint round_reveals_revealed_count_check check (revealed_count >= 0);

create table if not exists public.round_guesses (
  round_id uuid not null references public.rounds (id) on delete cascade,
  guesser_player_id uuid not null references public.players (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete cascade,
  guessed_player_id uuid references public.players (id) on delete set null,
  is_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (round_id, guesser_player_id),
  check (guesser_player_id <> target_player_id),
  check (guessed_player_id is null or guessed_player_id <> guesser_player_id)
);

create table if not exists public.round_reveal_order (
  round_id uuid not null references public.rounds (id) on delete cascade,
  reveal_index integer not null check (reveal_index > 0),
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (round_id, reveal_index),
  unique (round_id, player_id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create app profiles for the pre-provisioned Auth users when they already exist.
-- User passwords must be set separately in Supabase Auth, never stored in this SQL file.
insert into public.profiles (user_id, nickname)
select u.id, account.nickname
from (
  values
    ('noe@accounts.priorities', 'Noé'),
    ('clem@accounts.priorities', 'Clément'),
    ('eva@accounts.priorities', 'Eva')
) as account(email, nickname)
join auth.users as u on lower(u.email) = account.email
on conflict (user_id) do update
set nickname = excluded.nickname,
    updated_at = now();

create index if not exists players_game_id_idx on public.players (game_id);
create index if not exists rounds_game_id_round_index_idx
  on public.rounds (game_id, round_index desc);
create index if not exists player_rankings_round_id_idx
  on public.player_rankings (round_id);
create index if not exists round_guesses_round_id_idx
  on public.round_guesses (round_id);

-- Migrate legacy rounds.card_ids JSON arrays into the normalized relation.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rounds'
      and column_name = 'card_ids'
  ) then
    if exists (
      select 1
      from public.rounds
      where card_ids is null
         or case
              when jsonb_typeof(card_ids) = 'array'
                then jsonb_array_length(card_ids) <> 5
              else true
            end
    ) then
      raise exception 'Cannot migrate rounds: every card_ids value must be a JSON array of exactly five card IDs.';
    end if;

    if exists (
      select 1
      from public.rounds as r
      cross join lateral jsonb_array_elements_text(r.card_ids) as card_id(value)
      group by r.id, card_id.value
      having count(*) > 1
    ) then
      raise exception 'Cannot migrate rounds: a round contains duplicate card IDs.';
    end if;

    delete from public.round_cards;

    insert into public.round_cards (round_id, card_id, position)
    select r.id, card_id.value::uuid, card_id.ordinality::smallint
    from public.rounds as r
    cross join lateral jsonb_array_elements_text(r.card_ids)
      with ordinality as card_id(value, ordinality);

    if exists (
      select 1
      from public.rounds as r
      left join public.round_cards as rc on rc.round_id = r.id
      group by r.id
      having count(rc.card_id) <> 5
    ) then
      raise exception 'Cannot migrate rounds: a round references a missing card.';
    end if;

    alter table public.rounds drop column card_ids;
  end if;
end;
$$;

alter table public.cards enable row level security;
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_cards enable row level security;
alter table public.player_rankings enable row level security;
alter table public.round_reveals enable row level security;
alter table public.round_guesses enable row level security;
alter table public.round_reveal_order enable row level security;
alter table public.profiles enable row level security;

revoke all on public.cards from anon, authenticated;
revoke all on public.games from anon, authenticated;
revoke all on public.players from anon, authenticated;
revoke all on public.rounds from anon, authenticated;
revoke all on public.round_cards from anon, authenticated;
revoke all on public.player_rankings from anon, authenticated;
revoke all on public.round_reveals from anon, authenticated;
revoke all on public.round_guesses from anon, authenticated;
revoke all on public.round_reveal_order from anon, authenticated;
revoke all on public.profiles from anon, authenticated;

grant select on public.cards to anon, authenticated;
grant select, insert, update on public.games to anon, authenticated;
grant select on public.players to anon, authenticated;
grant insert on public.players to authenticated;
grant select, insert on public.rounds to anon, authenticated;
grant select, insert on public.round_cards to anon, authenticated;
grant select, insert, update on public.player_rankings to authenticated;
grant select on public.round_reveals to authenticated;
grant select on public.round_guesses to authenticated;
grant select on public.round_reveal_order to authenticated;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Anyone can read cards" on public.cards;
create policy "Anyone can read cards"
  on public.cards for select to anon, authenticated using (true);

drop policy if exists "Anyone can read games" on public.games;
create policy "Anyone can read games"
  on public.games for select to anon, authenticated using (true);
drop policy if exists "Anyone can create games" on public.games;
create policy "Anyone can create games"
  on public.games for insert to anon, authenticated with check (true);
drop policy if exists "Anyone can update games" on public.games;
create policy "Anyone can update games"
  on public.games for update to anon, authenticated using (true) with check (true);

drop policy if exists "Anyone can read players" on public.players;
create policy "Anyone can read players"
  on public.players for select to anon, authenticated using (true);
drop policy if exists "Anyone can join games" on public.players;
create policy "Anyone can join games"
  on public.players for insert to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists "Anyone can read rounds" on public.rounds;
create policy "Anyone can read rounds"
  on public.rounds for select to anon, authenticated using (true);
drop policy if exists "Anyone can create rounds" on public.rounds;
create policy "Anyone can create rounds"
  on public.rounds for insert to anon, authenticated with check (true);

drop policy if exists "Anyone can read round cards" on public.round_cards;
create policy "Anyone can read round cards"
  on public.round_cards for select to anon, authenticated using (true);
drop policy if exists "Anyone can add round cards" on public.round_cards;
create policy "Anyone can add round cards"
  on public.round_cards for insert to anon, authenticated with check (true);

drop policy if exists "Anyone can read rankings" on public.player_rankings;
drop policy if exists "Players can read authorized rankings" on public.player_rankings;
create policy "Players can read authorized rankings"
  on public.player_rankings for select to authenticated
  using (
    exists (
      select 1
      from public.players as owner
      join public.rounds as r on r.id = player_rankings.round_id
      join public.games as g on g.id = r.game_id
      where owner.id = player_rankings.player_id
        and (
          owner.auth_user_id = auth.uid()
          or g.status = 'RESULTS'
          or (
            g.status = 'GUESSING'
            and exists (
              select 1
              from public.round_guesses as guess
              join public.players as guesser
                on guesser.id = guess.guesser_player_id
              where guess.round_id = player_rankings.round_id
                and guess.target_player_id = player_rankings.player_id
                and guesser.auth_user_id = auth.uid()
            )
          )
          or (
            g.status = 'REVEAL'
            and exists (
              select 1
              from public.round_reveal_order as reveal_order
              join public.round_reveals as reveal
                on reveal.round_id = reveal_order.round_id
              where reveal_order.round_id = player_rankings.round_id
                and reveal_order.player_id = player_rankings.player_id
                and reveal_order.reveal_index <= reveal.revealed_count
            )
          )
        )
    )
  );
drop policy if exists "Anyone can submit rankings" on public.player_rankings;
create policy "Anyone can submit rankings"
  on public.player_rankings for insert to authenticated
  with check (
    exists (
      select 1
      from public.players as p
      join public.rounds as r on r.id = player_rankings.round_id
      join public.games as g on g.id = r.game_id
      where p.id = player_rankings.player_id
        and p.auth_user_id = auth.uid()
        and g.status = 'RANKING'
    )
  );
drop policy if exists "Anyone can update rankings" on public.player_rankings;
create policy "Anyone can update rankings"
  on public.player_rankings for update to authenticated
  using (
    exists (
      select 1
      from public.players as p
      join public.rounds as r on r.id = player_rankings.round_id
      join public.games as g on g.id = r.game_id
      where p.id = player_rankings.player_id
        and p.auth_user_id = auth.uid()
        and g.status = 'RANKING'
    )
  )
  with check (
    exists (
      select 1
      from public.players as p
      join public.rounds as r on r.id = player_rankings.round_id
      join public.games as g on g.id = r.game_id
      where p.id = player_rankings.player_id
        and p.auth_user_id = auth.uid()
        and g.status = 'RANKING'
    )
  );

drop policy if exists "Anyone can read round reveal progress" on public.round_reveals;
drop policy if exists "Players can read round reveal progress" on public.round_reveals;
create policy "Players can read round reveal progress"
  on public.round_reveals for select to authenticated
  using (
    exists (
      select 1
      from public.players as p
      join public.rounds as r on r.game_id = p.game_id
      where r.id = round_reveals.round_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Players can read their own guess" on public.round_guesses;
create policy "Players can read their own guess"
  on public.round_guesses for select to authenticated
  using (
    exists (
      select 1
      from public.players as p
      join public.rounds as r on r.id = round_guesses.round_id
      join public.games as g on g.id = r.game_id
      where p.id = round_guesses.guesser_player_id
        and (
          p.auth_user_id = auth.uid()
          or g.status = 'RESULTS'
        )
    )
  );
drop policy if exists "Players can submit their own guess" on public.round_guesses;

drop policy if exists "Players can read revealed order sequence" on public.round_reveal_order;
create policy "Players can read revealed order sequence"
  on public.round_reveal_order for select to authenticated
  using (
    exists (
      select 1
      from public.round_reveals as reveal
      join public.rounds as r on r.id = round_reveal_order.round_id
      join public.games as g on g.id = r.game_id
      where reveal.round_id = round_reveal_order.round_id
        and g.status in ('REVEAL', 'RESULTS')
        and round_reveal_order.reveal_index <= reveal.revealed_count
    )
  );

drop policy if exists "Players can manage their own profile" on public.profiles;
create policy "Players can manage their own profile"
  on public.profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.advance_round_reveal(
  p_round_id uuid,
  p_player_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_revealed_count integer;
begin
  if not exists (
    select 1
    from public.players as p
    where p.id = p_player_id
      and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Le joueur connecté ne correspond pas à cette session.';
  end if;

  update public.round_reveals as rr
  set revealed_count = rr.revealed_count + 1,
      updated_at = now()
  from public.rounds as r
  join public.games as g on g.id = r.game_id
  where rr.round_id = p_round_id
    and r.id = rr.round_id
    and g.status = 'REVEAL'
    and rr.controller_player_id = p_player_id
    and rr.revealed_count < (
      select count(*)
      from public.round_reveal_order as reveal_order
      where reveal_order.round_id = rr.round_id
    )
  returning rr.revealed_count into next_revealed_count;

  if next_revealed_count is null then
    raise exception 'Ce joueur ne contrôle pas le reveal ou tous les éléments sont déjà révélés.';
  end if;

  return next_revealed_count;
end;
$$;

create or replace function public.finish_round_reveal(
  p_round_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.players as p
    where p.id = p_player_id
      and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Le joueur connecté ne correspond pas à cette session.';
  end if;

  update public.games as g
  set status = 'RESULTS'
  from public.rounds as r
  join public.round_reveals as reveal on reveal.round_id = r.id
  where r.id = p_round_id
    and g.id = r.game_id
    and g.status = 'REVEAL'
    and reveal.controller_player_id = p_player_id
    and reveal.revealed_count = (
      select count(*)
      from public.round_reveal_order as reveal_order
      where reveal_order.round_id = p_round_id
    );

  if not found then
    raise exception 'Le reveal doit être terminé et contrôlé par le joueur désigné.';
  end if;
end;
$$;

create or replace function public.submit_round_guess(
  p_round_id uuid,
  p_guesser_player_id uuid,
  p_guessed_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.players as p
    where p.id = p_guesser_player_id
      and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Le joueur connecté ne correspond pas à cette session.';
  end if;

  update public.round_guesses as guess
  set guessed_player_id = p_guessed_player_id,
      is_submitted = true
  from public.rounds as r
  join public.games as g on g.id = r.game_id
  where guess.round_id = p_round_id
    and guess.guesser_player_id = p_guesser_player_id
    and r.id = guess.round_id
    and g.status = 'GUESSING'
    and exists (
      select 1
      from public.players as candidate
      where candidate.id = p_guessed_player_id
        and candidate.game_id = r.game_id
    )
    and guess.is_submitted = false;

  if not found then
    raise exception 'La réponse est invalide, déjà enregistrée ou le round n’est plus en phase de devinette.';
  end if;
end;
$$;

create or replace function public.get_round_progress(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  round_game_id uuid;
  progress jsonb;
begin
  select game_id into round_game_id
  from public.rounds
  where id = p_round_id;

  if round_game_id is null or not exists (
    select 1 from public.players
    where game_id = round_game_id and auth_user_id = auth.uid()
  ) then
    raise exception 'Round introuvable ou accès non autorisé.';
  end if;

  select jsonb_build_object(
    'submitted_count',
      (select count(*) from public.player_rankings
       where round_id = p_round_id and is_submitted),
    'guessed_count',
      (select count(*) from public.round_guesses
       where round_id = p_round_id and is_submitted)
  )
  into progress;

  return progress;
end;
$$;

create or replace function public.create_round_reveal_after_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  round_game_id uuid;
  game_status text;
  player_count integer;
  submitted_count integer;
  player_ids uuid[];
  reveal_player_ids uuid[];
  random_offset integer;
  player_index integer;
begin
  if not new.is_submitted then
    return new;
  end if;

  select r.game_id, g.status
  into round_game_id, game_status
  from public.rounds as r
  join public.games as g on g.id = r.game_id
  where r.id = new.round_id
  for update of g;

  if not found or game_status <> 'RANKING' then
    return new;
  end if;

  select count(*)::integer,
         count(*) filter (where pr.is_submitted)::integer
  into player_count, submitted_count
  from public.players as p
  left join public.player_rankings as pr
    on pr.player_id = p.id
    and pr.round_id = new.round_id
  where p.game_id = round_game_id;

  if player_count < 2 or submitted_count <> player_count then
    return new;
  end if;

  select array_agg(p.id order by random())
  into player_ids
  from public.players as p
  where p.game_id = round_game_id;

  random_offset := 1 + floor(random() * (player_count - 1))::integer;
  for player_index in 1..player_count loop
    insert into public.round_guesses (
      round_id,
      guesser_player_id,
      target_player_id
    )
    values (
      new.round_id,
      player_ids[player_index],
      player_ids[((player_index - 1 + random_offset) % player_count) + 1]
    )
    on conflict (round_id, guesser_player_id) do nothing;
  end loop;

  select array_agg(p.id order by random())
  into reveal_player_ids
  from public.players as p
  where p.game_id = round_game_id;

  insert into public.round_reveals (round_id, controller_player_id)
  select new.round_id, p.id
  from public.players as p
  where p.game_id = round_game_id
  order by random()
  limit 1
  on conflict (round_id) do nothing;

  for player_index in 1..player_count loop
    insert into public.round_reveal_order (round_id, reveal_index, player_id)
    values (new.round_id, player_index, reveal_player_ids[player_index])
    on conflict (round_id, reveal_index) do nothing;
  end loop;

  update public.games
  set status = 'GUESSING'
  where id = round_game_id
    and status = 'RANKING';

  return new;
end;
$$;

create or replace function public.finish_round_guesses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  round_game_id uuid;
  game_status text;
  player_count integer;
  submitted_count integer;
begin
  if not new.is_submitted or (tg_op = 'UPDATE' and old.is_submitted) then
    return new;
  end if;

  select r.game_id, g.status
  into round_game_id, game_status
  from public.rounds as r
  join public.games as g on g.id = r.game_id
  where r.id = new.round_id
  for update of g;

  if not found or game_status <> 'GUESSING' then
    return new;
  end if;

  select count(*)::integer,
         count(*) filter (where guess.is_submitted)::integer
  into player_count, submitted_count
  from public.players as p
  left join public.round_guesses as guess
    on guess.guesser_player_id = p.id
    and guess.round_id = new.round_id
  where p.game_id = round_game_id;

  if player_count = 0 or submitted_count <> player_count then
    return new;
  end if;

  update public.players as p
  set score = p.score + 1
  from public.round_guesses as guess
  where guess.round_id = new.round_id
    and guess.is_submitted
    and guess.guessed_player_id = guess.target_player_id
    and p.id = guess.guesser_player_id;

  update public.games
  set status = 'REVEAL'
  where id = round_game_id
    and status = 'GUESSING';

  return new;
end;
$$;

drop trigger if exists player_rankings_start_round_reveal on public.player_rankings;
create trigger player_rankings_start_round_reveal
  after insert or update of is_submitted on public.player_rankings
  for each row
  execute function public.create_round_reveal_after_submission();

drop trigger if exists round_guesses_finish_reveal on public.round_guesses;
create trigger round_guesses_finish_reveal
  after insert or update of is_submitted on public.round_guesses
  for each row
  execute function public.finish_round_guesses();

drop function if exists public.start_round_reveal(uuid, uuid);
revoke all on function public.advance_round_reveal(uuid, uuid) from public;
revoke all on function public.finish_round_reveal(uuid, uuid) from public;
revoke all on function public.submit_round_guess(uuid, uuid, uuid) from public;
revoke all on function public.get_round_progress(uuid) from public;
revoke all on function public.create_round_reveal_after_submission() from public;
revoke all on function public.finish_round_guesses() from public;
revoke all on function public.advance_round_reveal(uuid, uuid) from anon;
revoke all on function public.finish_round_reveal(uuid, uuid) from anon;
revoke all on function public.submit_round_guess(uuid, uuid, uuid) from anon;
revoke all on function public.get_round_progress(uuid) from anon;
grant execute on function public.advance_round_reveal(uuid, uuid) to authenticated;
grant execute on function public.finish_round_reveal(uuid, uuid) to authenticated;
grant execute on function public.submit_round_guess(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_round_progress(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    foreach table_name in array array[
      'games',
      'players',
      'rounds',
      'round_cards',
      'player_rankings',
      'round_reveals',
      'round_guesses',
      'round_reveal_order'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

commit;
