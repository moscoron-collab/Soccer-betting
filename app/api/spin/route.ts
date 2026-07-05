import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import {
  WHEEL,
  EXTRA_SPIN_COST,
  MAX_SPINS_PER_DAY,
  pickSliceIndex,
  spinsUsedToday,
  rollJackpot,
} from "@/lib/wheel";
import { localDate } from "@/lib/time";
import { comebackStatus, comebackAccess } from "@/lib/comeback";
import { getEventConfig } from "@/lib/event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/spin -> spin the wheel.
// First spin each day is free; the rest cost EXTRA_SPIN_COST, up to MAX_SPINS_PER_DAY.
// Resets at the player's local midnight (their timezone is sent as { tz }).
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

  // Bottom-of-the-table players use the Comeback Wheel instead — the two groups are kept
  // strictly separate, so the regular wheel is off-limits to them once it's live. Admins
  // keep the regular wheel (they get the comeback wheel too, as a preview).
  const { eligible: bottomSlice } = await comebackStatus(player.id);
  const { comebackLive } = await getEventConfig();
  const { showRegular } = comebackAccess(player.is_admin === true, bottomSlice, comebackLive);
  if (!showRegular) {
    return NextResponse.json(
      { error: "You're in the comeback group — use the 🌱 Comeback Wheel instead." },
      { status: 403 }
    );
  }

  const used = spinsUsedToday(player.spin_day, player.spins_today, today);
  if (used >= MAX_SPINS_PER_DAY) {
    return NextResponse.json(
      { error: "No spins left today. Come back tomorrow!" },
      { status: 429 }
    );
  }

  const isFree = used === 0;
  if (!isFree && player.coins < EXTRA_SPIN_COST) {
    return NextResponse.json(
      { error: `You need 🪙${EXTRA_SPIN_COST} for another spin.` },
      { status: 400 }
    );
  }

  // Decide the prize.
  const sliceIndex = pickSliceIndex();
  const slice = WHEEL[sliceIndex];

  // The amount actually awarded for this slice. The jackpot is a random prize, so
  // it differs from the slice's display amount ("up to 2K").
  let awarded = slice.amount;
  if (slice.kind === "JACKPOT") awarded = rollJackpot();

  // Build the update: pay the cost (if any), apply the prize, bump the counter.
  const update: Record<string, number | string> = {};
  let coins = player.coins;
  if (!isFree) coins -= EXTRA_SPIN_COST;

  // For a PCT slice the real coin change depends on the player's live balance, so we
  // compute it here (a % of their current cash) rather than trusting a fixed amount.
  let pctDelta = 0;

  if (slice.kind === "COINS" || slice.kind === "JACKPOT") {
    coins += awarded;
  } else if (slice.kind === "PCT") {
    // % of the cash balance (after any spin cost). Gains add; losses subtract but
    // never below 0, and only touch spendable coins (in-play stakes are untouched).
    const magnitude = Math.floor((coins * Math.abs(slice.amount)) / 100);
    pctDelta = slice.amount >= 0 ? magnitude : -Math.min(magnitude, coins);
    coins += pctDelta;
    awarded = pctDelta;
  } else if (slice.kind === "BOOST") {
    update.boost_2x = player.boost_2x + slice.amount;
  } else if (slice.kind === "SHIELD") {
    update.streak_shield = player.streak_shield + slice.amount;
  } else if (slice.kind === "FREEBET") {
    update.free_bets = (player.free_bets ?? 0) + slice.amount;
  }
  update.coins = coins;
  update.spin_day = today;
  update.spins_today = used + 1;
  update.last_spin_at = new Date().toISOString();

  const { error } = await supabase.from("players").update(update).eq("id", player.id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  // A little XP for playing, so progress moves even without a betting win.
  await supabase.rpc("increment_xp", { p_player: player.id, p_amount: 5 });

  // Echo the actual prize back so the UI shows it. Jackpot amount is randomised;
  // a PCT slice keeps its % in `amount` but carries the real coin change in `delta`.
  const resultSlice =
    slice.kind === "PCT"
      ? { ...slice, delta: pctDelta }
      : { ...slice, amount: awarded };

  return NextResponse.json({
    sliceIndex,
    slice: resultSlice,
    wasFree: isFree,
    coins,
    spinsLeft: MAX_SPINS_PER_DAY - (used + 1),
    nextSpinFree: false,
    boost_2x: update.boost_2x ?? player.boost_2x,
    streak_shield: update.streak_shield ?? player.streak_shield,
    free_bets: update.free_bets ?? player.free_bets ?? 0,
  });
}
