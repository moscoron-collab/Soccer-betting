# Soccer Prediction Game — project notes & go-live guide

This file is Claude's memory for this project. Read it at the start of every session.

## What this app is
A free-to-play soccer prediction game. Players get virtual coins, predict real
match results, win/lose coins, climb a leaderboard, play mini-games. **No real money.**

- **Frontend + API:** Next.js 14 (App Router), TypeScript, Tailwind. Single page at `app/page.tsx`.
- **Database:** Supabase (Postgres). Schema in `supabase/schema.sql`.
- **Match data:** football-data.org, pulled hourly by a GitHub Action.
- **Hosting:** Vercel. Live site: https://soccer-betting-tau.vercel.app

## How code gets to the live site (IMPORTANT)
1. Claude develops on the working branch `claude/dazzling-bohr-hkg5w7`.
2. The site's **live / production branch is `claude/elegant-galileo-0ecrmx`** (the repo's
   default branch). Vercel deploys THIS branch.
3. So after committing, Claude must **also push the changes onto the live branch**:
   ```
   git push origin HEAD:claude/elegant-galileo-0ecrmx
   ```
4. Vercel then auto-builds and updates the live URL — IF Vercel's "Production Branch"
   is set to `claude/elegant-galileo-0ecrmx` (see Go-live checklist).

### Standing instructions for Claude (so the user doesn't have to ask each time)
- After ANY code change the user approves: commit, push the working branch, AND
  fast-forward the live branch (`git push origin HEAD:claude/elegant-galileo-0ecrmx`).
- Then ALWAYS tell the user the two human steps that Claude cannot do:
  1. If `supabase/schema.sql` changed, re-run it in Supabase.
  2. Confirm Vercel finished deploying (and that Vercel's production branch is correct).
- Bump `lib/changelog.ts` VERSION + add an entry for user-visible changes.

## Go-live checklist (for the user — the parts Claude cannot do)
**1. Database (only needed when Claude says the schema changed)**
   - Supabase.com → your project → SQL Editor → New query →
     paste ALL of `supabase/schema.sql` → Run. (Safe to repeat.)

**2. Vercel (this is what makes the website update)**
   - Vercel = the service that turns the code into the live website.
   - Go to vercel.com → sign in → open the project (likely "soccer-betting").
   - **Deployments** tab: each push should create a build. When the newest one
     says **Ready**, the site is updated. Then hard-refresh the site
     (Ctrl+Shift+R, or Cmd+Shift+R on Mac).
   - If the live URL never changes: **Settings → Git → Production Branch** must be
     set to `claude/elegant-galileo-0ecrmx`. Change it if it says `main` or anything else,
     then redeploy. This is the usual reason "nothing goes live."
   - Required Vercel env vars (Settings → Environment Variables): see `.env.example`
     (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FOOTBALL_DATA_KEY`,
     `TRACKED_COMPETITIONS`, `SYNC_SECRET`, `NEXT_PUBLIC_SITE_URL`).

## Database columns added beyond the original V1 (run schema.sql to apply)
- players: `avatar`, `hide_picks`, `boost_2x`, `streak_shield`, `spin_day`, `spins_today`
- predictions: `boosted`
- function: `consume_shield(p_player uuid)`
- table: `app_meta` (throttles the activity-driven results refresh)

## Settlement / payouts (how coins get paid)
- `lib/settle.ts` holds the shared logic: `settleAll()` (settles finished games from
  DB only), `upsertMatches()`, and `quickRefresh()` (throttled fetch+settle).
- `/api/sync` (hourly GitHub Action) = full fetch of all competitions + settleAll. Backup.
- `/api/me` calls `quickRefresh()` on every load: globally throttled to ONE football-data
  call per minute (`app_meta.last_results_fetch`), so finished games settle within ~a
  minute while anyone is online. Uses the cheap single-request `/v4/matches` feed endpoint.
- To force settlement now: GitHub → Actions → "Sync matches & settle predictions" →
  Run workflow; or Claude can trigger it via the Actions API.

## Features built in this collaboration
### v2.2
- Profile pictures: upload your own photo (resized in-browser, stored in DB) or pick an emoji.
- Privacy toggle (see v2.3 for current behavior).
- Spin the Wheel: real animated wheel with prizes + power-ups.
  - `⚡ 2× payout` boost: spent on a chosen bet to double winnings (`predictions.boosted`).
  - `🛡️ streak shield`: auto-saves your win-streak from one loss (consumed at settlement).
- Settlement (`app/api/sync/route.ts`) doubles boosted wins and spends a shield before
  resetting a streak.

### v2.3
- Privacy toggle now hides **your own** picks from others until kickoff
  (enforced server-side in `app/api/matches/route.ts`).
- Wheel: cost 🪙150/spin, max 4 spins/day (1 free + 3 paid, tracked by
  `spin_day`/`spins_today`), added a "no win" (0 coins) slice. See `lib/wheel.ts`.
- Click any player's avatar (leaderboard or who-picked list) → opens their log via
  public endpoint `app/api/player/route.ts`. Respects the owner's hide-picks setting.
- Penalty Shootout bar sped up (0.85s → 0.4s) in `app/page.tsx`.
- Fixed avatars not showing on the leaderboard (no-store fetch + refresh after changes).

## Key files
- `app/page.tsx` — entire UI (single file). Components: Game, SpinWheel, PenaltyShootout,
  SettingsModal, PlayerLogModal, MatchCard, BetForm, WhoWins, Avatar.
- `lib/wheel.ts` — wheel slices, prices, daily-spin helpers (single source of truth, shared
  by API and UI).
- `lib/payout.ts` — scoring/multipliers. `lib/auth.ts` — player lookup by token.
- `app/api/*` — server routes (me, players, login, matches, predictions, spin, sync,
  leaderboard, player, penalty, challenges, achievements).

## Build / verify locally
- `npm install`
- `npx tsc --noEmit` (typecheck) and `npm run build` (full build) — both must pass before push.
