import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { BAILOUT_AMOUNT, BAILOUT_FLOOR } from "@/lib/payout";
import { MAX_SPINS_PER_DAY, spinsUsedToday } from "@/lib/wheel";
import { quickRefresh } from "@/lib/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me -> current player + their predictions (header: x-player-token)
export async function GET(req: Request) {
  let player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Settle freshly-finished games while players are online (throttled globally to
  // one feed call per minute), so winnings appear within ~a minute. Best-effort.
  await quickRefresh();
  // Re-read the player so the balance/streak reflect any just-settled bets.
  player = (await getPlayerFromRequest(req)) ?? player;

  const { data: predictions } = await supabase
    .from("predictions")
    .select(
      "id, match_id, type, pick, exact_home, exact_away, stake, payout, bonus_mult, boosted, status, created_at, matches(home_team, away_team, competition, kickoff_at, status, home_score, away_score, half_home, half_away, home_crest, away_crest)"
    )
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const canBailout =
    player.coins < BAILOUT_FLOOR &&
    (!player.last_bailout_at ||
      Date.now() - new Date(player.last_bailout_at).getTime() > 86400000);

  const used = spinsUsedToday(player.spin_day, player.spins_today);
  const spinsLeft = Math.max(0, MAX_SPINS_PER_DAY - used);
  const nextSpinFree = used === 0;

  const canPenalty =
    !player.last_penalty_at ||
    Date.now() - new Date(player.last_penalty_at).getTime() > 86400000;

  return NextResponse.json({
    player,
    predictions: predictions ?? [],
    canBailout,
    spinsLeft,
    nextSpinFree,
    canPenalty,
  });
}

// POST /api/me/bailout-style top-up: if broke, top up to the floor once per day.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (player.coins >= BAILOUT_FLOOR) {
    return NextResponse.json(
      { error: "You still have plenty of coins." },
      { status: 400 }
    );
  }
  if (
    player.last_bailout_at &&
    Date.now() - new Date(player.last_bailout_at).getTime() < 86400000
  ) {
    return NextResponse.json(
      { error: "You already topped up today. Come back tomorrow!" },
      { status: 429 }
    );
  }

  const { data, error } = await supabase
    .from("players")
    .update({ coins: BAILOUT_AMOUNT, last_bailout_at: new Date().toISOString() })
    .eq("id", player.id)
    .select("coins")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ coins: data.coins });
}

// Uploaded avatars are stored inline in the database, so keep them small.
const MAX_AVATAR_LEN = 400_000; // ~300 KB once base64-encoded

// PATCH /api/me -> update profile/settings: { avatar?, hidePicks? }
export async function PATCH(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, string | boolean | null> = {};

  if ("avatar" in body) {
    const avatar = body.avatar;
    if (avatar === null || avatar === "") {
      update.avatar = null;
    } else if (typeof avatar !== "string") {
      return NextResponse.json({ error: "Invalid avatar." }, { status: 400 });
    } else if (avatar.length > MAX_AVATAR_LEN) {
      return NextResponse.json({ error: "That image is too large." }, { status: 400 });
    } else if (
      avatar.length > 16 &&
      !avatar.startsWith("data:image/")
    ) {
      // Anything longer than a short emoji must be an image data URL.
      return NextResponse.json({ error: "Invalid avatar." }, { status: 400 });
    } else {
      update.avatar = avatar;
    }
  }

  if ("hidePicks" in body) {
    update.hide_picks = body.hidePicks === true;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await supabase.from("players").update(update).eq("id", player.id);
  if (error) {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
