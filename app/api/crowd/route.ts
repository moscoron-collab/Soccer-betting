import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/crowd -> the player's "Beat the Crowd" guesses (with match info)
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("crowd_guesses")
    .select("id, match_id, guess_pct, reward, status, matches(home_team, away_team, kickoff_at)")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ guesses: data ?? [] });
}

// POST /api/crowd { matchId, guessPct } -> submit a guess (free, before kickoff)
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = Number(body?.matchId);
  const guessPct = Math.round(Number(body?.guessPct));
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Missing match" }, { status: 400 });
  }
  if (!Number.isFinite(guessPct) || guessPct < 0 || guessPct > 100) {
    return NextResponse.json({ error: "Guess must be 0–100." }, { status: 400 });
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "SCHEDULED" || new Date(match.kickoff_at) <= new Date()) {
    return NextResponse.json({ error: "This match is closed for guessing." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("crowd_guesses")
    .select("id")
    .eq("player_id", player.id)
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already guessed this match." }, { status: 409 });
  }

  const { error } = await supabase.from("crowd_guesses").insert({
    player_id: player.id,
    match_id: matchId,
    guess_pct: guessPct,
    status: "PENDING",
  });
  if (error) return NextResponse.json({ error: "Could not save guess." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
