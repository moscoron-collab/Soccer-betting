-- Soccer Prediction Game — database schema
-- Paste this whole file into the Supabase SQL editor and click "Run".

-- ---------- players ----------
create table if not exists players (
  id              uuid primary key default gen_random_uuid(),
  username        text unique not null,
  secret_token    text unique not null,            -- session token stored in the browser
  password_hash   text,                            -- scrypt "salt:hash" (set on signup/first login)
  coins           integer not null default 1000,
  last_bailout_at timestamptz,                       -- for the "keep playing" top-up
  created_at      timestamptz not null default now()
);

-- ---------- matches (mirrors football-data.org) ----------
create table if not exists matches (
  id           bigint primary key,                  -- football-data match id
  competition  text not null,
  home_team    text not null,
  away_team    text not null,
  kickoff_at   timestamptz not null,
  status       text not null default 'SCHEDULED',   -- SCHEDULED | IN_PLAY | FINISHED
  home_score   integer,
  away_score   integer,
  half_home    integer,                              -- half-time score (home)
  half_away    integer,                              -- half-time score (away)
  home_crest   text,                                 -- team flag / logo URL
  away_crest   text,
  settled      boolean not null default false,
  updated_at   timestamptz not null default now()
);

create index if not exists matches_kickoff_idx on matches (kickoff_at);
create index if not exists matches_status_idx on matches (status);

-- ---------- predictions ----------
create table if not exists predictions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  match_id    bigint not null references matches(id) on delete cascade,
  type        text not null,                         -- WINNER | EXACT | HALFTIME | GOALS3
  pick        text,                                  -- HOME|DRAW|AWAY (WINNER/HALFTIME) or YES|NO (GOALS3)
  exact_home  integer,                               -- (for EXACT)
  exact_away  integer,                               -- (for EXACT)
  stake       integer not null,
  payout      integer not null default 0,
  status      text not null default 'PENDING',       -- PENDING | WON | LOST
  created_at  timestamptz not null default now(),
  unique (player_id, match_id)                       -- one prediction per match per player (V1)
);

create index if not exists predictions_player_idx on predictions (player_id);
create index if not exists predictions_match_idx on predictions (match_id);

-- ---------- helper: atomic coin increment (used when settling winnings) ----------
create or replace function increment_coins(p_player uuid, p_amount integer)
returns void language sql as $$
  update players set coins = coins + p_amount where id = p_player;
$$;

-- Note: the app talks to the database only through server-side API routes using the
-- service_role key, so Row Level Security is not required for V1. If you later expose
-- the database directly to the browser, enable RLS and add policies.
