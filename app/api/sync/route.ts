import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchMatches } from "@/lib/footballData";
import { computePayout, PredictionType } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// football-data calls are slow (rate-limited), so allow a long run on Vercel.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-sync-secret");
  const url = new URL(req.url);
  const query = url.searchParams.get("secret");
  return header === secret || query === secret;
}

async function runSync() {
  // 1) Pull recent + upcoming matches and upsert them.
  const fdMatches = await fetchMatches(3, 10);
  let upserted = 0;
  if (fdMatches.length > 0) {
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
    if (error) console.error("[sync] upsert matches error", error);
    else upserted = rows.length;
  }

  // 2) Settle finished, unsettled matches that have scores.
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
      .select("id, player_id, type, pick, exact_home, exact_away, stake, bonus_mult")
      .eq("match_id", match.id)
      .eq("status", "PENDING");

    for (const p of preds ?? []) {
      const { won, payout } = computePayout(
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

      await supabase
        .from("predictions")
        .update({ status: won ? "WON" : "LOST", payout })
        .eq("id", p.id);

      if (payout > 0) {
        await supabase.rpc("increment_coins", { p_player: p.player_id, p_amount: payout });
      }
      settledPredictions++;
    }

    await supabase.from("matches").update({ settled: true }).eq("id", match.id);
    settledMatches++;
  }

  // 3) Settle "Beat the Crowd" guesses for matches that have kicked off.
  let settledGuesses = 0;
  const { data: guesses } = await supabase
    .from("crowd_guesses")
    .select("id, player_id, match_id, guess_pct, matches(kickoff_at)")
    .eq("status", "PENDING");

  const now = new Date();
  for (const g of guesses ?? []) {
    const ko = (g as any).matches?.kickoff_at;
    if (!ko || new Date(ko) > now) continue; // not started yet

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

  return { upserted, settledMatches, settledPredictions, settledGuesses };
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[sync] error", err);
    return NextResponse.json({ error: err?.message ?? "sync failed" }, { status: 500 });
  }
}

// Allow GET too so it can be triggered from a browser/cron with ?secret=...
export async function GET(req: Request) {
  return POST(req);
}
