import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINS_PER_GOAL = 30; // 5 goals = 150 coins max per day

function canPlay(last: string | null): boolean {
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000;
}

// POST /api/penalty { goals } -> award coins for the daily shootout (once per day)
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!canPlay(player.last_penalty_at)) {
    return NextResponse.json({ error: "You already played today. Come back tomorrow!" }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Clamp to 0–5 so a bad client can't over-claim; the daily cap bounds it anyway.
  const goals = Math.max(0, Math.min(5, Math.floor(Number(body?.goals))));
  const reward = goals * COINS_PER_GOAL;

  const { error } = await supabase
    .from("players")
    .update({ coins: player.coins + reward, last_penalty_at: new Date().toISOString() })
    .eq("id", player.id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  return NextResponse.json({ reward, goals, coins: player.coins + reward });
}
