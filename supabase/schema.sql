-- Soccer Prediction Game — database schema
-- Paste this whole file into the Supabase SQL editor and click "Run".

-- ---------- players ----------
create table if not exists players (
  id              uuid primary key default gen_random_uuid(),
  username        text unique not null,
  secret_token    text unique not null,            -- session token stored in the browser
  password_hash   text,                            -- scrypt "salt:hash" (set on signup/first login)
  coins           integer not null default 1000,
  xp              integer not null default 0,        -- experience points -> level
  win_streak      integer not null default 0,        -- current consecutive winning bets
  last_bailout_at timestamptz,                       -- for the "keep playing" top-up
  last_spin_at    timestamptz,                       -- for the daily spin
  last_penalty_at timestamptz,                       -- for the daily penalty shootout
  avatar          text,                              -- emoji preset or uploaded image data URL
  hide_picks      boolean not null default false,    -- hide your own picks from others until kickoff
  boost_2x        integer not null default 0,        -- "2x payout" power-ups in inventory (from the wheel)
  streak_shield   integer not null default 0,        -- "streak shield" power-ups in inventory (from the wheel)
  free_bets       integer not null default 0,        -- "free bet" tokens in inventory (from the wheel)
  pending_gamble  integer not null default 0,        -- coins from the last spin win that can be double-or-nothing'd
  spin_day        date,                              -- the day the spin counter below applies to
  spins_today     integer not null default 0,        -- spins used today (1 free, then paid up to the daily cap)
  is_admin        boolean not null default false,    -- can moderate (delete) any chat message
  login_streak    integer not null default 0,        -- consecutive-day login streak (daily login bonus)
  last_login_day  date,                              -- last local day the login bonus was granted
  last_cashback_at timestamptz,                      -- last time daily loss-cashback was granted
  last_seen_at    timestamptz,                       -- last load (powers the "we missed you" welcome-back gift)
  device_id       text,                              -- "one device = one account": stable id from the browser (null for legacy accounts)
  created_at      timestamptz not null default now()
);

-- Upgrade existing installs (these no-op if the columns already exist).
alter table players add column if not exists avatar        text;
alter table players add column if not exists hide_picks    boolean not null default false;
alter table players add column if not exists boost_2x       integer not null default 0;
alter table players add column if not exists streak_shield  integer not null default 0;
alter table players add column if not exists free_bets       integer not null default 0;
alter table players add column if not exists pending_gamble  integer not null default 0;
alter table players add column if not exists spin_day        date;
alter table players add column if not exists spins_today     integer not null default 0;
alter table players add column if not exists is_admin        boolean not null default false;
alter table players add column if not exists login_streak     integer not null default 0;
alter table players add column if not exists last_login_day   date;
alter table players add column if not exists last_cashback_at timestamptz;
alter table players add column if not exists last_seen_at     timestamptz;
alter table players add column if not exists device_id        text;

-- "One device = one account": at most one player per device_id. Legacy rows have
-- device_id = null and are exempt (Postgres treats nulls as distinct), so existing
-- players are grandfathered in and never blocked.
create unique index if not exists players_device_id_idx
  on players (device_id) where device_id is not null;

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
  bonus_mult  numeric not null default 1,            -- underdog + Match of the Day bonus, locked at bet time
  boosted     boolean not null default false,        -- spent a "2x payout" power-up on this bet
  free_bet    boolean not null default false,        -- placed with a "free bet" token (no coins risked)
  status      text not null default 'PENDING',       -- PENDING | WON | LOST
  created_at  timestamptz not null default now(),
  unique (player_id, match_id, type)                 -- one bet of each type per match per player
);

create index if not exists predictions_player_idx on predictions (player_id);
create index if not exists predictions_match_idx on predictions (match_id);

-- Upgrade existing installs.
alter table predictions add column if not exists boosted boolean not null default false;
alter table predictions add column if not exists free_bet boolean not null default false;
alter table predictions add column if not exists settled_at timestamptz; -- when it settled (for daily loss cashback)

-- ---------- crowd_guesses ("Beat the Crowd" mini-game) ----------
create table if not exists crowd_guesses (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  match_id    bigint not null references matches(id) on delete cascade,
  guess_pct   integer not null,                      -- guessed % backing the favourite
  reward      integer not null default 0,
  status      text not null default 'PENDING',       -- PENDING | SETTLED
  created_at  timestamptz not null default now(),
  unique (player_id, match_id)
);

-- ---------- parlays (combo bets) ----------
create table if not exists parlays (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  stake       integer not null,
  mult        numeric not null default 1,            -- combined multiplier of all legs
  payout      integer not null default 0,
  legs        jsonb not null,                        -- [{match_id,type,pick,exact_home,exact_away,home_team,away_team}]
  status      text not null default 'PENDING',       -- PENDING | WON | LOST
  created_at  timestamptz not null default now()
);
create index if not exists parlays_player_idx on parlays (player_id);

-- ---------- challenge_claims (daily challenges) ----------
create table if not exists challenge_claims (
  player_id   uuid not null references players(id) on delete cascade,
  day         date not null,
  key         text not null,
  created_at  timestamptz not null default now(),
  primary key (player_id, day, key)
);

-- ---------- helper: atomic coin increment (used when settling winnings) ----------
create or replace function increment_coins(p_player uuid, p_amount integer)
returns void language sql as $$
  update players set coins = coins + p_amount where id = p_player;
$$;

create or replace function increment_xp(p_player uuid, p_amount integer)
returns void language sql as $$
  update players set xp = xp + p_amount where id = p_player;
$$;

-- Spend one "streak shield" power-up if the player has any. Returns true if a
-- shield was consumed (so the caller can keep the win-streak alive on a loss).
create or replace function consume_shield(p_player uuid)
returns boolean language plpgsql as $$
begin
  update players set streak_shield = streak_shield - 1
    where id = p_player and streak_shield > 0;
  return found;
end $$;

-- Win/lose a bet: bumps or resets the streak and returns the new value.
create or replace function bump_streak(p_player uuid, p_won boolean)
returns integer language plpgsql as $$
declare s integer;
begin
  if p_won then
    update players set win_streak = win_streak + 1 where id = p_player returning win_streak into s;
  else
    update players set win_streak = 0 where id = p_player returning win_streak into s;
  end if;
  return s;
end $$;

-- ---------- achievement_claims (one coin reward per achievement) ----------
create table if not exists achievement_claims (
  player_id  uuid not null references players(id) on delete cascade,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (player_id, key)
);

-- ---------- messages (global chat lobby) ----------
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  body        text not null,                          -- already sanitized server-side (max 200 chars)
  kind        text not null default 'user',           -- 'user' (typed) | 'join' (auto welcome)
  deleted     boolean not null default false,         -- soft delete (hidden by moderator or author)
  created_at  timestamptz not null default now()
);
create index if not exists messages_created_idx on messages (created_at desc);
alter table messages add column if not exists kind text not null default 'user';

-- ---------- welcome_gifts (one-time "warm welcome" coin gift per player) ----------
create table if not exists welcome_gifts (
  player_id  uuid primary key references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- app_meta (small key/value store) ----------
-- Used to throttle the activity-driven results refresh to one feed call per minute.
create table if not exists app_meta (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
insert into app_meta (key, value)
  values ('last_results_fetch', '1970-01-01T00:00:00.000Z')
  on conflict (key) do nothing;

-- ---------- "Road to the Final" event config (the admin control panel) ----------
-- Stored as app_meta key/value rows. Defaults keep the event OFF and the banner
-- admin-only (preview mode) until the admin flips them from the in-app panel.
insert into app_meta (key, value) values
  ('banner_public',    'false'),               -- false = only admins see the banner
  ('event_on',         'false'),               -- false = no event lines / no featured multiplier
  ('event_name',       'Road to the Final'),
  ('featured_mult',    '2.5'),                  -- featured match Winner payout (total ×)
  ('jackpot_amount',   '5000'),                -- displayed jackpot (admin bumps it)
  ('featured_override','')                      -- a match id to force-feature, or '' for auto
  on conflict (key) do nothing;

-- ---------- jackpot_wins (log of jackpot payouts, for the Hall of Fame) ----------
create table if not exists jackpot_wins (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  amount      integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists jackpot_wins_created_idx on jackpot_wins (created_at desc);

-- Note: the app talks to the database only through server-side API routes using the
-- service_role key, so Row Level Security is not required for V1. If you later expose
-- the database directly to the browser, enable RLS and add policies.
