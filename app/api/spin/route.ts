import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weighted wheel: small wins common, big wins rare.
const WHEEL = [50, 50, 75, 100, 100, 150, 200, 300, 500];

function spinReward(): number {
  return WHEEL[Math.floor(Math.random() * WHEEL.length)];
}

function canSpin(lastSpinAt: string | null): boolean {
  if (!lastSpinAt) return true;
  return Date.now() - new Date(lastSpinAt).getTime() > 24 * 60 * 60 * 1000;
}

// POST /api/spin -> award daily coins (once per 24h)
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!canSpin(player.last_spin_at)) {
    return NextResponse.json(
      { error: "You already spun today. Come back tomorrow!" },
      { status: 429 }
    );
  }

  const reward = spinReward();
  const { error } = await supabase
    .from("players")
    .update({ coins: player.coins + reward, last_spin_at: new Date().toISOString() })
    .eq("id", player.id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  return NextResponse.json({ reward, coins: player.coins + reward });
}
