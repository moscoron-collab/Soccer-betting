import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, Player } from "@/lib/auth";
import { computeBonusMult } from "@/lib/bonus";
import { PredictionType, validateSelection, FREE_BET_STAKE, isKnockoutStage } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedPrediction = {
  type: PredictionType;
  pick: string | null;
  exactHome: number | null;
  exactAway: number | null;
  stake: number;
};

// Validates the prediction fields shared by placing (POST) and editing (PUT).
// Returns either the parsed prediction or an error message.
function parsePrediction(body: any): { ok: true; value: ParsedPrediction } | { ok: false; error: string } {
  const stake = Math.floor(Number(body?.stake));
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, error: "Stake must be a positive number" };
  }

  const sel = validateSelection(body?.type, body?.pick, body?.exactHome, body?.exactAway);
  if (!sel.ok) return { ok: false, error: sel.error };

  return {
    ok: true,
    value: { type: sel.type, pick: sel.pick, exactHome: sel.exactHome, exactAway: sel.exactAway, stake },
  };
}

// Knockout matches can't end in a draw, so the full-time Winner market only offers
// the two teams. Returns an error message if a DRAW pick slips through, else null.
// (Half-time leader still allows a draw — a knockout game can be level at the break.)
function knockoutDrawError(
  stage: string | null | undefined,
  type: PredictionType,
  pick: string | null
): string | null {
  if (type === "WINNER" && pick === "DRAW" && isKnockoutStage(stage)) {
    return "This is a knockout match — pick a winner. A tie is decided in extra time and penalties.";
  }
  return null;
}

// A short kickoff time like "3:00 PM" in the player's timezone, for clear errors.
function fmtKickoff(iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || "UTC",
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(iso));
  }
}

// Confirms a match exists and is still open for predictions (not kicked off).
async function getOpenMatch(matchId: number, tz?: string | null) {
  const { data: match } = await supabase
    .from("matches")
    .select("id, status, kickoff_at, stage")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Match not found", status: 404 as const };

  const now = new Date();
  const kickedOff = new Date(match.kickoff_at) <= now;
  if (match.status !== "SCHEDULED" || kickedOff) {
    // Log the timing so a refusal that happens with a CORRECT clock (i.e. a real
    // bug, not a player's slow device) is visible in the server logs.
    console.warn(
      `[predictions] bet refused for match ${matchId}: status=${match.status} ` +
        `kickoff_at=${match.kickoff_at} now=${now.toISOString()} ` +
        `reason=${kickedOff ? "kickoff-passed" : "not-scheduled"}`
    );
    const error = kickedOff
      ? `This match kicked off at ${fmtKickoff(match.kickoff_at, tz)} — betting is closed.`
      : "This match is already underway — betting is closed.";
    return { error, status: 400 as const };
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

  // A "free bet" token places a fixed-stake bet with no coins risked. It can't be
  // combined with a 2× boost, and the stake is forced to the token's value.
  const wantsFreeBet = body?.freeBet === true;
  if (wantsFreeBet) {
    if ((player.free_bets ?? 0) < 1) {
      return NextResponse.json({ error: "You have no free bet tokens left." }, { status: 400 });
    }
    p.stake = FREE_BET_STAKE;
  } else if (p.stake > player.coins) {
    return NextResponse.json({ error: "You don't have enough coins." }, { status: 400 });
  }

  // Optional "2x payout" power-up spent on this bet (ignored for free bets).
  const wantsBoost = !wantsFreeBet && body?.boosted === true;
  if (wantsBoost && player.boost_2x < 1) {
    return NextResponse.json({ error: "You have no 2× power-ups left." }, { status: 400 });
  }

  const open = await getOpenMatch(matchId, body?.tz);
  if ("error" in open) return NextResponse.json({ error: open.error }, { status: open.status });

  const koErr = knockoutDrawError(open.match.stage, p.type, p.pick);
  if (koErr) return NextResponse.json({ error: koErr }, { status: 400 });

  // One bet of each type per match per player.
  const { data: existing } = await supabase
    .from("predictions")
    .select("id")
    .eq("player_id", player.id)
    .eq("match_id", matchId)
    .eq("type", p.type)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "You already have this type of bet on this match. Edit it instead." },
      { status: 409 }
    );
  }

  // Free bet: spend a token instead of coins (no stake escrowed). Otherwise deduct
  // the stake now (escrow), guarding against a race on balance.
  let freeBetSpent = false;
  const newBalance = wantsFreeBet ? player.coins : player.coins - p.stake;
  if (wantsFreeBet) {
    const { data: token } = await supabase
      .from("players")
      .update({ free_bets: (player.free_bets ?? 0) - 1 })
      .eq("id", player.id)
      .gte("free_bets", 1)
      .select("id")
      .maybeSingle();
    if (!token) {
      return NextResponse.json({ error: "You have no free bet tokens left." }, { status: 400 });
    }
    freeBetSpent = true;
  } else {
    const { error: balanceErr } = await supabase
      .from("players")
      .update({ coins: newBalance })
      .eq("id", player.id)
      .gte("coins", p.stake);
    if (balanceErr) {
      return NextResponse.json({ error: "Could not place prediction." }, { status: 500 });
    }
  }

  // Spend a 2× charge now (guarded so it can't go negative on a race).
  let boostSpent = false;
  if (wantsBoost) {
    const { data: charged } = await supabase
      .from("players")
      .update({ boost_2x: player.boost_2x - 1 })
      .eq("id", player.id)
      .gte("boost_2x", 1)
      .select("id")
      .maybeSingle();
    if (!charged) {
      await supabase.from("players").update({ coins: player.coins }).eq("id", player.id);
      return NextResponse.json({ error: "You have no 2× power-ups left." }, { status: 400 });
    }
    boostSpent = true;
  }

  const bonusMult = await computeBonusMult(matchId, p.type, p.pick, body?.tz);

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
      boosted: boostSpent,
      free_bet: freeBetSpent,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    // Roll back the stake / token (and the spent charge, if any).
    await supabase.from("players").update({ coins: player.coins }).eq("id", player.id);
    if (freeBetSpent) {
      await supabase.from("players").update({ free_bets: player.free_bets }).eq("id", player.id);
    }
    if (boostSpent) {
      await supabase.from("players").update({ boost_2x: player.boost_2x }).eq("id", player.id);
    }
    return NextResponse.json({ error: "Could not place prediction." }, { status: 500 });
  }

  await supabase.rpc("increment_xp", { p_player: player.id, p_amount: 10 });
  return NextResponse.json({ id: created.id, coins: newBalance });
}

// Loads a pending prediction owned by the player whose match is still open. Shared by PUT/DELETE.
async function getEditablePrediction(player: Player, predictionId: string, tz?: string | null) {
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
  const open = await getOpenMatch(pred.match_id, tz);
  if ("error" in open) return { error: open.error, status: open.status };
  return { pred, stage: open.match.stage as string | null };
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

  const found = await getEditablePrediction(player, predictionId, body?.tz);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
  const old = found.pred;

  const parsed = parsePrediction(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = parsed.value;

  const koErr = knockoutDrawError(found.stage, p.type, p.pick);
  if (koErr) return NextResponse.json({ error: koErr }, { status: 400 });

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

  const bonusMult = await computeBonusMult(old.match_id, p.type, p.pick, body?.tz);

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

  const found = await getEditablePrediction(player, predictionId, body?.tz);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
  const old = found.pred;

  const { error: delErr } = await supabase.from("predictions").delete().eq("id", old.id);
  if (delErr) return NextResponse.json({ error: "Could not cancel bet." }, { status: 500 });

  const refunded = player.coins + old.stake;
  await supabase.from("players").update({ coins: refunded }).eq("id", player.id);

  return NextResponse.json({ coins: refunded });
}
