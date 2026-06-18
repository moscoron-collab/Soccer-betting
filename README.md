# ⚽ Soccer Prediction Game

A free-to-play web game where players start with **1,000 virtual coins**, predict the results of
**real soccer matches** (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League and
more), and win or lose coins based on what actually happens. There's a global leaderboard and a
shareable link so friends can join. **No real money — virtual coins only.**

This is **Version 1 (the lean, fun core)**. It's built so more features (levels, daily rewards,
private leagues, badges, mini-games) can be added later.

---

## What's in this version

- Sign up with just a **username** (no password). You get a **recovery code** to log back in on
  another device.
- Predict the **winner / draw** (pays 2×) or the **exact score** (pays 5×) of upcoming matches.
- Choose how many coins to **stake**. Win → coins back times the multiplier. Lose → you lose the stake.
- **Leaderboard** ranks everyone by coin balance.
- **Invite a friend** button shares the game link.
- Out of coins? A free **daily top-up** keeps you playing.
- Matches and results update **automatically** every hour.

---

## How it all fits together (plain English)

- **The website** (this code) runs free on **Vercel**.
- **The data** (players, predictions, coins) lives in a free **Supabase** database.
- **Real match info** comes from **football-data.org** (free).
- A small **GitHub Action** runs every hour to fetch matches, settle finished games into coins, and
  keep the free database awake. All free.

---

## Set it up (step by step)

You'll create 3 free accounts (Supabase, football-data.org, Vercel) and copy a few keys. ~20 minutes.

### 1. Database — Supabase
1. Go to **https://supabase.com** → create a free account → **New project** (pick any name & a
   database password; choose the region closest to you).
2. When it's ready, open **SQL Editor**, click **New query**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API** and copy two things:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** key (under "Project API keys") → this is `SUPABASE_SERVICE_KEY` *(keep secret)*

### 2. Match data — football-data.org
1. Register free at **https://www.football-data.org/client/register**.
2. They email you an **API token** → this is `FOOTBALL_DATA_KEY`.

### 3. Put the code on GitHub
This repository is already that code. Push it to your own GitHub repo (or use this one).

### 4. Deploy — Vercel
1. Go to **https://vercel.com** → sign in with GitHub → **Add New Project** → import this repo.
2. Before deploying, add **Environment Variables** (Settings → Environment Variables). Use
   [`.env.example`](.env.example) as the checklist:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `FOOTBALL_DATA_KEY`
   - `TRACKED_COMPETITIONS` → e.g. `PL,PD,SA,BL1,FL1,CL`
   - `SYNC_SECRET` → make up a long random string (e.g. mash the keyboard)
   - `NEXT_PUBLIC_SITE_URL` → your Vercel URL (you can add this after the first deploy)
3. Click **Deploy**. When done, copy your live URL (e.g. `https://your-game.vercel.app`) and set it
   as `NEXT_PUBLIC_SITE_URL`, then redeploy.

### 5. Turn on the hourly updater — GitHub Actions
The workflow is already in [`.github/workflows/sync.yml`](.github/workflows/sync.yml). In your GitHub
repo go to **Settings → Secrets and variables → Actions → New repository secret** and add:
- `SYNC_SECRET` → the **same** string you used in Vercel
- `SITE_URL` → your live Vercel URL (no trailing slash)

It runs every hour automatically. You can also run it now: **Actions** tab → *Sync matches & settle
predictions* → **Run workflow**.

### 6. Load matches the first time
Trigger the workflow once (step 5) so the game has matches to predict. After that it's automatic.

**Done!** Share your Vercel URL with friends. Everyone picks a username and starts with 1,000 coins.

---

## Run it on your own computer (optional, for testing)

```bash
npm install
cp .env.example .env.local   # then fill in your real keys
npm run dev                  # open http://localhost:3000
```

To load matches / settle results locally:

```bash
SYNC_SECRET=your-secret SITE_URL=http://localhost:3000 npm run sync:local
```

---

## Adjusting the game balance

Edit [`lib/payout.ts`](lib/payout.ts):
- `WINNER_MULTIPLIER`, `EXACT_MULTIPLIER` — how much winning pays.
- `STARTING_COINS` — starting balance.
- `BAILOUT_FLOOR` / `BAILOUT_AMOUNT` — the "out of coins" daily top-up.

---

## Good to know (free-tier notes)

- **football-data.org** free tier: 12 competitions, scores slightly delayed, 10 requests/minute.
  The hourly job spaces out its calls to stay under the limit.
- **Supabase** free tier sleeps after ~7 days of no activity — the hourly job keeps it awake.
- **Vercel + GitHub Actions** free tiers are plenty for a family-and-friends game.

## What's intentionally NOT here yet (future versions)
Levels/XP, daily challenges & streaks, private leagues with invite codes, monthly seasons,
achievements/badges, mini-games, and extra bet types (total goals, both-teams-to-score, specials).
The code and database are structured so these can be added without a rewrite.
