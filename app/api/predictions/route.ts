import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, Player } from "@/lib/auth";
import { computeBonusMult } from "@/lib/bonus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedPrediction = {
  type: "WINNER" | "EXACT" | "HALFTIME" | "GOALS3";
  pick: string | null;
  exactHome: number | null;
  exactAway: number | null;
  stake: number;
};

// Validates the prediction fields shared by placing (POST) and editing (PUT).
// Returns either the parsed prediction or an error message.
function parsePrediction(body: any): { ok: true; value: ParsedPrediction } | { ok: false; error: string } {
  const type = body?.type;
  const stake = Math.floor(Number(body?.stake));

  if (!["WINNER", "EXACT", "HALFTIME", "GOALS3"].includes(type)) {
    return { ok: false, error: "Invalid prediction type" };
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, error: "Stake must be a positive number" };
  }

  let pick: string | null = null;
  let exactHome: number | null = null;
  let exactAway: number | null = null;

  if (type === "WINNER" || type === "HALFTIME") {
    pick = body?.pick;
    if (!["HOME", "DRAW", "AWAY"].includes(pick ?? "")) {
      return { ok: false, error: "Pick HOME, DRAW or AWAY" };
    }
  } else if (type === "GOALS3") {
    pick = body?.pick;
    if (!["YES", "NO"].includes(pick ?? "")) {
      return { ok: false, error: "Pick YES or NO" };
    }
  } else {
    // EXACT
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
      return { ok: false, error: "Enter a valid score" };
    }
  }

  return { ok: true, value: { type, pick, exactHome, exactAway, stake } };
}

// Confirms a match exists and is still open for predictions (not kicked off).
async function getOpenMatch(matchId: number) {
  const { data: match } = await supabase
    .from("matches")
    .select("id, status, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Match not found", status: 404 as const };
  if (match.status !== "SCHEDULED" || new Date(match.kickoff_at) <= new Date()) {
    return { error: "This match is closed for predictions.", status: 400 as const };
  }
  return { match };
}

// POST /api/predictions — place a new prediction.
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
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Missing match" }, { status: 400 });
  }

  const parsed = parsePrediction(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = parsed.value;

  if (p.stake > player.coins) {
    return NextResponse.json({ error: "You don't have enough coins." }, { status: 400 });
  }

  const open = await getOpenMatch(matchId);
  if ("error" in open) return NextResponse.json({ error: open.error }, { status: open.status });

  // One prediction per match per player.
  const { data: existing } = await supabase
    .from("predictions")
    .select("id")
    .eq("player_id", player.id)
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already predicted this match. Edit it instead." }, { status: 409 });
  }

  // Deduct the stake now (escrow), guarding against a race on balance.
  const newBalance = player.coins - p.stake;
  const { error: balanceErr } = await supabase
    .from("players")
    .update({ coins: newBalance })
    .eq("id", player.id)
    .gte("coins", p.stake);
  if (balanceErr) {
    return NextResponse.json({ error: "Could not place prediction." }, { status: 500 });
  }

  const bonusMult = await computeBonusMult(matchId, p.type, p.pick);

  const { data: created, error: insertErr } = await supabase
    .from("predictions")
    .insert({
      player_id: player.id,
      match_id: matchId,
      type: p.type,
      pick: p.pick,
      exact_home: p.exactHome,
      exact_away: p.exactAway,
      stake: p.stake,
      bonus_mult: bonusMult,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    await supabase.from("players").update({ coins: player.coins }).eq("id", player.id);
    return NextResponse.json({ error: "Could not place prediction." }, { status: 500 });
  }

  return NextResponse.json({ id: created.id, coins: newBalance });
}

// Loads a pending prediction owned by the player whose match is still open. Shared by PUT/DELETE.
async function getEditablePrediction(player: Player, predictionId: string) {
  const { data: pred } = await supabase
    .from("predictions")
    .select("id, player_id, match_id, stake, status")
    .eq("id", predictionId)
    .maybeSingle();
  if (!pred || pred.player_id !== player.id) {
    return { error: "Prediction not found", status: 404 as const };
  }
  if (pred.status !== "PENDING") {
    return { error: "This bet has already been settled.", status: 400 as const };
  }
  const open = await getOpenMatch(pred.match_id);
  if ("error" in open) return { error: open.error, status: open.status };
  return { pred };
}

// PUT /api/predictions — edit an existing bet before kickoff.
export async function PUT(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const predictionId = String(body?.predictionId ?? "");
  if (!predictionId) return NextResponse.json({ error: "Missing prediction" }, { status: 400 });

  const found = await getEditablePrediction(player, predictionId);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
  const old = found.pred;

  const parsed = parsePrediction(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = parsed.value;

  // Coins available = current balance + the stake we'll refund from the old bet.
  const available = player.coins + old.stake;
  if (p.stake > available) {
    return NextResponse.json({ error: "You don't have enough coins." }, { status: 400 });
  }

  const newBalance = available - p.stake;
  const { error: coinErr } = await supabase
    .from("players")
    .update({ coins: newBalance })
    .eq("id", player.id);
  if (coinErr) return NextResponse.json({ error: "Could not update bet." }, { status: 500 });

  const bonusMult = await computeBonusMult(old.match_id, p.type, p.pick);

  const { error: updErr } = await supabase
    .from("predictions")
    .update({
      type: p.type,
      pick: p.pick,
      exact_home: p.exactHome,
      exact_away: p.exactAway,
      stake: p.stake,
      bonus_mult: bonusMult,
      status: "PENDING",
      payout: 0,
    })
    .eq("id", old.id);

  if (updErr) {
    await supabase.from("players").update({ coins: player.coins }).eq("id", player.id);
    return NextResponse.json({ error: "Could not update bet." }, { status: 500 });
  }

  return NextResponse.json({ id: old.id, coins: newBalance });
}

// DELETE /api/predictions — cancel a bet before kickoff and refund the stake.
export async function DELETE(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const predictionId = String(body?.predictionId ?? "");
  if (!predictionId) return NextResponse.json({ error: "Missing prediction" }, { status: 400 });

  const found = await getEditablePrediction(player, predictionId);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
  const old = found.pred;

  const { error: delErr } = await supabase.from("predictions").delete().eq("id", old.id);
  if (delErr) return NextResponse.json({ error: "Could not cancel bet." }, { status: 500 });

  const refunded = player.coins + old.stake;
  await supabase.from("players").update({ coins: refunded }).eq("id", player.id);

  return NextResponse.json({ coins: refunded });
}
