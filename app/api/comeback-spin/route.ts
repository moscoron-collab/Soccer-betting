import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { COMEBACK_WHEEL, pickSliceIndex, rollJackpot } from "@/lib/wheel";
import { localDate } from "@/lib/time";
import { comebackStatus, comebackSpinsLeft, markComebackSpin, comebackAccess } from "@/lib/comeback";
import { getEventConfig } from "@/lib/event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/comeback-spin -> a free daily catch-up spin for players near the bottom of
// the table. Richer prizes, no "no win". Eligibility AND the daily limit are checked
// server-side so neither can be spoofed by the client.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* tz is optional; default to UTC */
  }
  const today = localDate(body?.tz);

  // Re-check access here (not trusted from the client): the bottom slice once the wheel
  // is live, or an admin previewing it. A top player can't call this endpoint directly.
  const { eligible: bottomSlice } = await comebackStatus(player.id);
  const { comebackLive } = await getEventConfig();
  const { showComeback } = comebackAccess(player.is_admin === true, bottomSlice, comebackLive);
  if (!showComeback) {
    return NextResponse.json(
      { error: "The comeback wheel is only for players near the bottom of the table." },
      { status: 403 }
    );
  }

  // Admins see this wheel as a PREVIEW only: roll a real-looking result for the
  // animation, but DON'T touch coins/inventory or the daily counter — so testing it
  // never changes anything. (Real eligible players fall through to the live spin below.)
  if (player.is_admin === true) {
    const sliceIndex = pickSliceIndex(COMEBACK_WHEEL);
    const slice = COMEBACK_WHEEL[sliceIndex];
    let awarded = slice.amount;
    if (slice.kind === "JACKPOT") awarded = rollJackpot() * 2;
    return NextResponse.json({
      sliceIndex,
      slice: { ...slice, amount: awarded },
      preview: true,
      coins: player.coins, // unchanged
      comebackSpinsLeft: 1, // never used up while previewing
      boost_2x: player.boost_2x,
      streak_shield: player.streak_shield,
      free_bets: player.free_bets ?? 0,
    });
  }

  const left = await comebackSpinsLeft(player.id, today);
  if (left <= 0) {
    return NextResponse.json(
      { error: "No comeback spin left today. Come back tomorrow!" },
      { status: 429 }
    );
  }

  // Decide the prize (free — no coin cost for the catch-up spin).
  const sliceIndex = pickSliceIndex(COMEBACK_WHEEL);
  const slice = COMEBACK_WHEEL[sliceIndex];
  let awarded = slice.amount;
  if (slice.kind === "JACKPOT") awarded = rollJackpot() * 2; // doubled, like the rest of this wheel

  const update: Record<string, number | string> = {};
  let coins = player.coins;
  if (slice.kind === "COINS" || slice.kind === "JACKPOT") {
    coins += awarded;
  } else if (slice.kind === "BOOST") {
    update.boost_2x = player.boost_2x + slice.amount;
  } else if (slice.kind === "SHIELD") {
    update.streak_shield = player.streak_shield + slice.amount;
  } else if (slice.kind === "FREEBET") {
    update.free_bets = (player.free_bets ?? 0) + slice.amount;
  }
  update.coins = coins;

  const { error } = await supabase.from("players").update(update).eq("id", player.id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  await markComebackSpin(player.id, today);
  // A little XP for playing, same as the regular wheel.
  await supabase.rpc("increment_xp", { p_player: player.id, p_amount: 5 });

  const resultSlice = { ...slice, amount: awarded };
  return NextResponse.json({
    sliceIndex,
    slice: resultSlice,
    coins,
    comebackSpinsLeft: Math.max(0, left - 1),
    boost_2x: update.boost_2x ?? player.boost_2x,
    streak_shield: update.streak_shield ?? player.streak_shield,
    free_bets: update.free_bets ?? player.free_bets ?? 0,
  });
}
