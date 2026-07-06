import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { baseMultiplier, validateSelection, isKnockoutStage } from "@/lib/payout";
import { needsSpinBeforeBet } from "@/lib/betgate";
import { localDate } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_LEGS = 2;
const MAX_LEGS = 6;
const MULT_CAP = 50;

// GET /api/parlays -> the player's combo bets
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("parlays")
    .select("id, stake, mult, payout, legs, status, created_at")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ parlays: data ?? [] });
}

// POST /api/parlays { stake, legs:[{matchId,type,pick,exactHome,exactAway}] }
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Must use up all of today's regular-wheel spins before betting (regular wheel only).
  if (await needsSpinBeforeBet(player, localDate(body?.tz))) {
    return NextResponse.json(
      { error: "🎡 Spin the wheel first! Use up all of today's spins before placing a bet.", code: "SPIN_REQUIRED" },
      { status: 403 }
    );
  }

  const stake = Math.floor(Number(body?.stake));
  const rawLegs = Array.isArray(body?.legs) ? body.legs : [];
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "Stake must be a positive number" }, { status: 400 });
  }
  if (rawLegs.length < MIN_LEGS || rawLegs.length > MAX_LEGS) {
    return NextResponse.json(
      { error: `A combo needs ${MIN_LEGS}–${MAX_LEGS} picks.` },
      { status: 400 }
    );
  }
  if (stake > player.coins) {
    return NextResponse.json({ error: "You don't have enough coins." }, { status: 400 });
  }

  // Validate each leg's selection.
  const validated = rawLegs.map((l: any) =>
    validateSelection(l?.type, l?.pick, l?.exactHome, l?.exactAway)
  );
  const bad = validated.find((v: any) => !v.ok);
  if (bad) return NextResponse.json({ error: (bad as any).error }, { status: 400 });

  const matchIds = rawLegs.map((l: any) => Number(l?.matchId));
  if (matchIds.some((id: number) => !Number.isFinite(id))) {
    return NextResponse.json({ error: "Missing match in a pick" }, { status: 400 });
  }
  if (new Set(matchIds).size !== matchIds.length) {
    return NextResponse.json({ error: "Use a different match for each pick." }, { status: 400 });
  }

  // All matches must exist and still be open.
  const { data: matches } = await supabase
    .from("matches")
    .select("id, status, kickoff_at, home_team, away_team, stage")
    .in("id", matchIds);
  const byId = new Map((matches ?? []).map((m) => [m.id, m]));
  const now = new Date();

  for (const id of matchIds) {
    const m = byId.get(id);
    if (!m) return NextResponse.json({ error: "A match was not found." }, { status: 404 });
    if (m.status !== "SCHEDULED" || new Date(m.kickoff_at) <= now) {
      return NextResponse.json({ error: "A match in your combo has already started." }, { status: 400 });
    }
  }

  // A knockout match can't end in a draw — reject any DRAW Winner leg on one.
  for (const l of rawLegs) {
    const m = byId.get(Number(l?.matchId));
    if (m && l?.type === "WINNER" && l?.pick === "DRAW" && isKnockoutStage(m.stage)) {
      return NextResponse.json(
        { error: "A knockout match can't end in a draw — pick a winner." },
        { status: 400 }
      );
    }
  }

  // All selections validated ok above.
  const sels = validated as Array<{
    ok: true;
    type: import("@/lib/payout").PredictionType;
    pick: string | null;
    exactHome: number | null;
    exactAway: number | null;
  }>;

  const mult = Math.min(
    MULT_CAP,
    sels.reduce((p, s) => p * baseMultiplier(s.type), 1)
  );

  const legRows = rawLegs.map((l: any, i: number) => {
    const m = byId.get(Number(l.matchId))!;
    const s = sels[i];
    return {
      match_id: m.id,
      type: s.type,
      pick: s.pick,
      exact_home: s.exactHome,
      exact_away: s.exactAway,
      home_team: m.home_team,
      away_team: m.away_team,
    };
  });

  // Deduct stake, then create the parlay.
  const newBalance = player.coins - stake;
  const { error: coinErr } = await supabase
    .from("players")
    .update({ coins: newBalance })
    .eq("id", player.id)
    .gte("coins", stake);
  if (coinErr) return NextResponse.json({ error: "Could not place combo." }, { status: 500 });

  const { data: created, error: insErr } = await supabase
    .from("parlays")
    .insert({ player_id: player.id, stake, mult, legs: legRows, status: "PENDING" })
    .select("id")
    .single();
  if (insErr || !created) {
    await supabase.from("players").update({ coins: player.coins }).eq("id", player.id);
    return NextResponse.json({ error: "Could not place combo." }, { status: 500 });
  }

  await supabase.rpc("increment_xp", { p_player: player.id, p_amount: 10 });
  return NextResponse.json({ id: created.id, coins: newBalance, mult });
}
