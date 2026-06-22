import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { isNewLocalDay } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINS_PER_GOAL = 50; // 5 goals = 250 coins max per day

// POST /api/penalty { goals, tz } -> award coins for the daily shootout
// (once per local day; the player's timezone is sent as { tz }).
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isNewLocalDay(player.last_penalty_at, body?.tz)) {
    return NextResponse.json({ error: "You already played today. Come back tomorrow!" }, { status: 429 });
  }

  // Clamp to 0–5 so a bad client can't over-claim; the daily cap bounds it anyway.
  const goals = Math.max(0, Math.min(5, Math.floor(Number(body?.goals))));
  const reward = goals * COINS_PER_GOAL;

  const { error } = await supabase
    .from("players")
    .update({ coins: player.coins + reward, last_penalty_at: new Date().toISOString() })
    .eq("id", player.id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  // A little XP for playing, so progress moves even without a betting win.
  await supabase.rpc("increment_xp", { p_player: player.id, p_amount: 5 });

  return NextResponse.json({ reward, goals, coins: player.coins + reward });
}
