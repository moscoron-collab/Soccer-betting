import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/predictions
// body: { matchId, type: "WINNER"|"EXACT", pick?, exactHome?, exactAway?, stake }
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = Number(body?.matchId);
  const type = body?.type;
  const stake = Math.floor(Number(body?.stake));

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Missing match" }, { status: 400 });
  }
  if (type !== "WINNER" && type !== "EXACT") {
    return NextResponse.json({ error: "Invalid prediction type" }, { status: 400 });
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "Stake must be a positive number" }, { status: 400 });
  }
  if (stake > player.coins) {
    return NextResponse.json({ error: "You don't have enough coins." }, { status: 400 });
  }

  let pick: string | null = null;
  let exactHome: number | null = null;
  let exactAway: number | null = null;

  if (type === "WINNER") {
    pick = body?.pick;
    if (!["HOME", "DRAW", "AWAY"].includes(pick ?? "")) {
      return NextResponse.json({ error: "Pick HOME, DRAW or AWAY" }, { status: 400 });
    }
  } else {
    exactHome = Math.floor(Number(body?.exactHome));
    exactAway = Math.floor(Number(body?.exactAway));
    if (
      !Number.isFinite(exactHome) ||
      !Number.isFinite(exactAway) ||
      exactHome < 0 ||
      exactAway < 0 ||
      exactHome > 30 ||
      exactAway > 30
    ) {
      return NextResponse.json({ error: "Enter a valid score" }, { status: 400 });
    }
  }

  // Match must exist, be scheduled, and not have kicked off yet.
  const { data: match } = await supabase
    .from("matches")
    .select("id, status, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status !== "SCHEDULED" || new Date(match.kickoff_at) <= new Date()) {
    return NextResponse.json({ error: "This match is closed for predictions." }, { status: 400 });
  }

  // One prediction per match per player.
  const { data: existing } = await supabase
    .from("predictions")
    .select("id")
    .eq("player_id", player.id)
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already predicted this match." }, { status: 409 });
  }

  // Deduct the stake now (escrow). Guard against a race by re-checking balance.
  const newBalance = player.coins - stake;
  const { error: balanceErr } = await supabase
    .from("players")
    .update({ coins: newBalance })
    .eq("id", player.id)
    .gte("coins", stake);
  if (balanceErr) {
    return NextResponse.json({ error: "Could not place prediction." }, { status: 500 });
  }

  const { data: created, error: insertErr } = await supabase
    .from("predictions")
    .insert({
      player_id: player.id,
      match_id: matchId,
      type,
      pick,
      exact_home: exactHome,
      exact_away: exactAway,
      stake,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    // Refund if the insert failed (e.g. duplicate slipped through).
    await supabase.from("players").update({ coins: player.coins }).eq("id", player.id);
    return NextResponse.json({ error: "Could not place prediction." }, { status: 500 });
  }

  return NextResponse.json({ id: created.id, coins: newBalance });
}
