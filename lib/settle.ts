// Settlement logic, shared by the hourly /api/sync job and the lightweight
// "settle while players are online" refresh that /api/me triggers.

import { supabase } from "./supabase";
import { computePayout, PredictionType, BOOST_MULTIPLIER } from "./payout";
import { fetchRecentResults, FdMatch } from "./footballData";

// Bonus coins when a winning bet reaches these streak lengths.
const STREAK_BONUS: Record<number, number> = { 3: 50, 5: 150, 10: 500 };

// Write football-data matches into our table (insert new, update scores/status).
export async function upsertMatches(fdMatches: FdMatch[]): Promise<number> {
  if (fdMatches.length === 0) return 0;
  const rows = fdMatches.map((m) => ({
    id: m.id,
    competition: m.competition,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    home_crest: m.homeCrest,
    away_crest: m.awayCrest,
    kickoff_at: m.kickoff,
    status: m.status,
    home_score: m.homeScore,
    away_score: m.awayScore,
    half_home: m.halfHome,
    half_away: m.halfAway,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("matches").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[settle] upsert matches error", error);
    return 0;
  }
  return rows.length;
}

// Settle everything that's ready, using only data already in the database
// (no external calls). Pays out predictions, crowd guesses and parlays.
export async function settleAll() {
  // 1) Finished, unsettled matches with scores -> settle their predictions.
  const { data: finished } = await supabase
    .from("matches")
    .select("id, home_score, away_score, half_home, half_away")
    .eq("status", "FINISHED")
    .eq("settled", false)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  let settledMatches = 0;
  let settledPredictions = 0;

  for (const match of finished ?? []) {
    const homeScore = match.home_score as number;
    const awayScore = match.away_score as number;
    const halfHome = (match.half_home as number | null) ?? null;
    const halfAway = (match.half_away as number | null) ?? null;

    const { data: preds } = await supabase
      .from("predictions")
      .select("id, player_id, type, pick, exact_home, exact_away, stake, bonus_mult, boosted")
      .eq("match_id", match.id)
      .eq("status", "PENDING");

    for (const p of preds ?? []) {
      const result = computePayout(
        p.type as PredictionType,
        p.pick ?? null,
        p.exact_home,
        p.exact_away,
        p.stake,
        homeScore,
        awayScore,
        halfHome,
        halfAway,
        Number(p.bonus_mult ?? 1)
      );
      const won = result.won;
      // A spent "2x payout" power-up doubles a winning bet.
      const payout = won && p.boosted ? result.payout * BOOST_MULTIPLIER : result.payout;

      await supabase
        .from("predictions")
        .update({ status: won ? "WON" : "LOST", payout })
        .eq("id", p.id);

      if (payout > 0) {
        await supabase.rpc("increment_coins", { p_player: p.player_id, p_amount: payout });
        await supabase.rpc("increment_xp", { p_player: p.player_id, p_amount: 25 });
      }

      if (won) {
        const { data: newStreak } = await supabase.rpc("bump_streak", {
          p_player: p.player_id,
          p_won: true,
        });
        const bonus = STREAK_BONUS[newStreak as number];
        if (bonus) {
          await supabase.rpc("increment_coins", { p_player: p.player_id, p_amount: bonus });
        }
      } else {
        // On a loss, a "streak shield" power-up (if any) keeps the streak alive.
        const { data: shielded } = await supabase.rpc("consume_shield", {
          p_player: p.player_id,
        });
        if (!shielded) {
          await supabase.rpc("bump_streak", { p_player: p.player_id, p_won: false });
        }
      }
      settledPredictions++;
    }

    await supabase.from("matches").update({ settled: true }).eq("id", match.id);
    settledMatches++;
  }

  // 2) "Beat the Crowd" guesses for matches that have kicked off.
  let settledGuesses = 0;
  const { data: guesses } = await supabase
    .from("crowd_guesses")
    .select("id, player_id, match_id, guess_pct, matches(kickoff_at)")
    .eq("status", "PENDING");

  const now = new Date();
  for (const g of guesses ?? []) {
    const ko = (g as any).matches?.kickoff_at;
    if (!ko || new Date(ko) > now) continue;

    const { data: rows } = await supabase
      .from("predictions")
      .select("pick")
      .eq("match_id", g.match_id)
      .in("type", ["WINNER", "HALFTIME"]);
    const counts: Record<string, number> = { HOME: 0, DRAW: 0, AWAY: 0 };
    for (const r of rows ?? []) if (r.pick && r.pick in counts) counts[r.pick]++;
    const total = counts.HOME + counts.DRAW + counts.AWAY;
    const favShare = total ? Math.max(counts.HOME, counts.DRAW, counts.AWAY) / total : 0;
    const actualPct = Math.round(favShare * 100);
    const diff = Math.abs(g.guess_pct - actualPct);

    let reward = 0;
    if (total > 0) {
      if (diff <= 5) reward = 200;
      else if (diff <= 15) reward = 100;
      else if (diff <= 30) reward = 50;
    }

    await supabase.from("crowd_guesses").update({ status: "SETTLED", reward }).eq("id", g.id);
    if (reward > 0) {
      await supabase.rpc("increment_coins", { p_player: g.player_id, p_amount: reward });
    }
    settledGuesses++;
  }

  // 3) Combo bets (parlays) once all their legs are finished.
  let settledParlays = 0;
  const { data: parlays } = await supabase
    .from("parlays")
    .select("id, player_id, stake, mult, legs")
    .eq("status", "PENDING");

  for (const par of parlays ?? []) {
    const legs = (par.legs as any[]) ?? [];
    const ids = legs.map((l) => l.match_id);
    const { data: legMatches } = await supabase
      .from("matches")
      .select("id, status, home_score, away_score, half_home, half_away")
      .in("id", ids);
    const mById = new Map((legMatches ?? []).map((m) => [m.id, m]));

    const allFinished = legs.every((l) => {
      const m = mById.get(l.match_id);
      return m && m.status === "FINISHED" && m.home_score != null && m.away_score != null;
    });
    if (!allFinished) continue;

    const allWon = legs.every((l) => {
      const m = mById.get(l.match_id)!;
      return computePayout(
        l.type as PredictionType,
        l.pick ?? null,
        l.exact_home,
        l.exact_away,
        1,
        m.home_score as number,
        m.away_score as number,
        m.half_home,
        m.half_away
      ).won;
    });

    const payout = allWon ? Math.round(par.stake * Number(par.mult)) : 0;
    await supabase
      .from("parlays")
      .update({ status: allWon ? "WON" : "LOST", payout })
      .eq("id", par.id);
    if (payout > 0) {
      await supabase.rpc("increment_coins", { p_player: par.player_id, p_amount: payout });
      await supabase.rpc("increment_xp", { p_player: par.player_id, p_amount: 50 });
    }
    settledParlays++;
  }

  return { settledMatches, settledPredictions, settledGuesses, settledParlays };
}

// How often (ms) the activity-driven refresh may hit the football-data feed.
const REFRESH_THROTTLE_MS = 60_000;

// Triggered on app activity (from /api/me). At most once per REFRESH_THROTTLE_MS
// globally, it pulls fresh results (one cheap request) and settles them, so coins
// land within ~a minute while anyone is online. Best-effort: never throws.
export async function quickRefresh(): Promise<void> {
  try {
    // Atomically "claim" the refresh slot: only the request that wins the update
    // (because enough time has passed) does the work; everyone else returns fast.
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - REFRESH_THROTTLE_MS).toISOString();
    const { data: claimed } = await supabase
      .from("app_meta")
      .update({ value: nowIso, updated_at: nowIso })
      .eq("key", "last_results_fetch")
      .lt("value", cutoffIso)
      .select("key");

    if (!claimed || claimed.length === 0) return; // refreshed recently — skip

    const recent = await fetchRecentResults(2, 1);
    await upsertMatches(recent);
    await settleAll();
  } catch (err) {
    console.error("[quickRefresh]", err);
  }
}
