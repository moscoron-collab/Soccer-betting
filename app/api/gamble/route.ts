import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/gamble -> "double or nothing" on the coins just won from the wheel.
// The spin stored the gambleable amount in players.pending_gamble. A 50/50 either
// doubles that win (adds the amount again) or loses it (subtracts the amount).
// One gamble per win: we atomically clear pending_gamble so it can't be replayed.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const amount = player.pending_gamble ?? 0;
  if (amount <= 0) {
    return NextResponse.json({ error: "Nothing to gamble right now." }, { status: 400 });
  }

  // Claim the gamble atomically: only succeeds if pending_gamble is still `amount`.
  const { data: claimed } = await supabase
    .from("players")
    .update({ pending_gamble: 0 })
    .eq("id", player.id)
    .eq("pending_gamble", amount)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ error: "Nothing to gamble right now." }, { status: 400 });
  }

  const won = Math.random() < 0.5;
  const delta = won ? amount : -amount;
  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: delta });

  return NextResponse.json({
    won,
    amount,
    delta,
    coins: player.coins + delta,
  });
}
