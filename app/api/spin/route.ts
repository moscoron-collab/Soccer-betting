import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { WHEEL, EXTRA_SPIN_COST, pickSliceIndex } from "@/lib/wheel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function freeSpinReady(lastSpinAt: string | null): boolean {
  if (!lastSpinAt) return true;
  return Date.now() - new Date(lastSpinAt).getTime() > 24 * 60 * 60 * 1000;
}

// POST /api/spin -> spin the wheel.
// Free once per 24h; after that an extra spin costs EXTRA_SPIN_COST coins.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const isFree = freeSpinReady(player.last_spin_at);
  if (!isFree && player.coins < EXTRA_SPIN_COST) {
    return NextResponse.json(
      { error: `You need 🪙${EXTRA_SPIN_COST} for an extra spin.` },
      { status: 400 }
    );
  }

  // Decide the prize.
  const sliceIndex = pickSliceIndex();
  const slice = WHEEL[sliceIndex];

  // Build the update: pay the cost (if any) and apply the prize.
  const update: Record<string, number | string> = {};
  let coins = player.coins;
  if (!isFree) coins -= EXTRA_SPIN_COST;

  if (slice.kind === "COINS" || slice.kind === "JACKPOT") {
    coins += slice.amount;
  } else if (slice.kind === "BOOST") {
    update.boost_2x = player.boost_2x + slice.amount;
  } else if (slice.kind === "SHIELD") {
    update.streak_shield = player.streak_shield + slice.amount;
  }
  update.coins = coins;
  if (isFree) update.last_spin_at = new Date().toISOString();

  const { error } = await supabase.from("players").update(update).eq("id", player.id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  return NextResponse.json({
    sliceIndex,
    slice,
    wasFree: isFree,
    coins,
    boost_2x: update.boost_2x ?? player.boost_2x,
    streak_shield: update.streak_shield ?? player.streak_shield,
  });
}
