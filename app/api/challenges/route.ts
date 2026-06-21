import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, Player } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGES = [
  { key: "bet_1", label: "Place a bet", target: 1, reward: 50 },
  { key: "spin_1", label: "Spin the wheel", target: 1, reward: 50 },
  { key: "penalty_1", label: "Play the Penalty Shootout", target: 1, reward: 50 },
] as const;

function todayStartISO(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).toISOString();
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function countSince(table: string, playerId: string, sinceISO: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .gte("created_at", sinceISO);
  return count ?? 0;
}

async function computeProgress(player: Player): Promise<Record<string, number>> {
  const since = todayStartISO();
  const bets = await countSince("predictions", player.id, since);
  const spunToday = player.last_spin_at ? new Date(player.last_spin_at) >= new Date(since) : false;
  const penaltyToday = player.last_penalty_at
    ? new Date(player.last_penalty_at) >= new Date(since)
    : false;
  return {
    bet_1: bets,
    spin_1: spunToday ? 1 : 0,
    penalty_1: penaltyToday ? 1 : 0,
  };
}

// GET /api/challenges -> today's challenges with progress + claim state
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const progress = await computeProgress(player);
  const { data: claims } = await supabase
    .from("challenge_claims")
    .select("key")
    .eq("player_id", player.id)
    .eq("day", todayStr());
  const claimed = new Set((claims ?? []).map((c) => c.key));

  const list = CHALLENGES.map((c) => ({
    ...c,
    progress: Math.min(progress[c.key] ?? 0, c.target),
    claimed: claimed.has(c.key),
    claimable: (progress[c.key] ?? 0) >= c.target && !claimed.has(c.key),
  }));
  return NextResponse.json({ challenges: list });
}

// POST /api/challenges { key } -> claim a completed challenge's reward
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const challenge = CHALLENGES.find((c) => c.key === body?.key);
  if (!challenge) return NextResponse.json({ error: "Unknown challenge" }, { status: 400 });

  const progress = await computeProgress(player);
  if ((progress[challenge.key] ?? 0) < challenge.target) {
    return NextResponse.json({ error: "Not finished yet." }, { status: 400 });
  }

  // The primary key (player, day, key) stops double-claims.
  const { error: claimErr } = await supabase
    .from("challenge_claims")
    .insert({ player_id: player.id, day: todayStr(), key: challenge.key });
  if (claimErr) {
    return NextResponse.json({ error: "Already claimed today." }, { status: 409 });
  }

  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: challenge.reward });
  return NextResponse.json({ reward: challenge.reward, coins: player.coins + challenge.reward });
}
