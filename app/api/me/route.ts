import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { BAILOUT_AMOUNT, BAILOUT_FLOOR } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me -> current player + their predictions (header: x-player-token)
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: predictions } = await supabase
    .from("predictions")
    .select(
      "id, match_id, type, pick, exact_home, exact_away, stake, payout, bonus_mult, status, created_at, matches(home_team, away_team, competition, kickoff_at, status, home_score, away_score, half_home, half_away, home_crest, away_crest)"
    )
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const canBailout =
    player.coins < BAILOUT_FLOOR &&
    (!player.last_bailout_at ||
      Date.now() - new Date(player.last_bailout_at).getTime() > 86400000);

  const canSpin =
    !player.last_spin_at ||
    Date.now() - new Date(player.last_spin_at).getTime() > 86400000;

  const canPenalty =
    !player.last_penalty_at ||
    Date.now() - new Date(player.last_penalty_at).getTime() > 86400000;

  return NextResponse.json({ player, predictions: predictions ?? [], canBailout, canSpin, canPenalty });
}

// POST /api/me/bailout-style top-up: if broke, top up to the floor once per day.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (player.coins >= BAILOUT_FLOOR) {
    return NextResponse.json(
      { error: "You still have plenty of coins." },
      { status: 400 }
    );
  }
  if (
    player.last_bailout_at &&
    Date.now() - new Date(player.last_bailout_at).getTime() < 86400000
  ) {
    return NextResponse.json(
      { error: "You already topped up today. Come back tomorrow!" },
      { status: 429 }
    );
  }

  const { data, error } = await supabase
    .from("players")
    .update({ coins: BAILOUT_AMOUNT, last_bailout_at: new Date().toISOString() })
    .eq("id", player.id)
    .select("coins")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ coins: data.coins });
}
