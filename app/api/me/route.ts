import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, lookupPlayerByToken } from "@/lib/auth";
import {
  BAILOUT_AMOUNT,
  BAILOUT_FLOOR,
  CASHBACK_PCT,
  CASHBACK_CAP,
  loginBonusFor,
  WELCOMEBACK_GIFT,
  WELCOMEBACK_AWAY_HOURS,
} from "@/lib/payout";
import type { Player } from "@/lib/auth";
import { MAX_SPINS_PER_DAY, spinsUsedToday, isComebackEligible } from "@/lib/wheel";
import { comebackSpinsLeft, comebackAccess, isComebackArmed, armComeback } from "@/lib/comeback";
import { getEventConfig } from "@/lib/event";
import { quickRefresh } from "@/lib/settle";
import { localDate, isNewLocalDay } from "@/lib/time";
import { netWorthLeaderboard, toPublic } from "@/lib/networth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time "warm welcome" coin gift. It switches on once the Saudi Arabia–Spain
// World Cup match is finished, with a safety fallback time so it can't get stuck
// if that match can't be matched in our data.
const WELCOME_GIFT_AMOUNT = 500;
const WELCOME_GIFT_FALLBACK = Date.parse("2026-06-21T20:00:00Z"); // ~23:00 Israel

async function welcomeGiftActive(): Promise<boolean> {
  try {
    const { data } = await supabase.from("matches").select("home_team, away_team, status").limit(300);
    const m = (data ?? []).find((r) => {
      const s = `${r.home_team} ${r.away_team}`.toLowerCase();
      return s.includes("spain") && s.includes("saudi");
    });
    if (m && m.status === "FINISHED") return true;
  } catch {
    /* ignore — fall through to the time fallback */
  }
  return Date.now() >= WELCOME_GIFT_FALLBACK;
}

// Grants the gift once per player (the welcome_gifts PK prevents doubles).
// Returns true only on the load where it was actually granted (to show a popup).
async function grantWelcomeGift(player: { id: string; coins: number }): Promise<boolean> {
  try {
    if (!(await welcomeGiftActive())) return false;
    const { error } = await supabase.from("welcome_gifts").insert({ player_id: player.id });
    if (error) return false; // already gifted, or table not created yet
    await supabase.rpc("increment_coins", { p_player: player.id, p_amount: WELCOME_GIFT_AMOUNT });
    player.coins += WELCOME_GIFT_AMOUNT;
    return true;
  } catch {
    return false;
  }
}

// Daily login bonus: once per local day, growing with the consecutive-day streak.
// Returns the granted { day, amount } only on the load it was awarded.
async function grantLoginBonus(
  player: Player,
  tz: string | null,
  today: string
): Promise<{ day: number; amount: number } | null> {
  if (player.last_login_day === today) return null;
  const yesterday = localDate(tz, new Date(Date.now() - 86_400_000));
  const streak = player.last_login_day === yesterday ? (player.login_streak || 0) + 1 : 1;
  const amount = loginBonusFor(streak);
  const { error } = await supabase
    .from("players")
    .update({ login_streak: streak, last_login_day: today })
    .eq("id", player.id);
  if (error) return null;
  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: amount });
  player.coins += amount;
  player.login_streak = streak;
  player.last_login_day = today;
  return { day: streak, amount };
}

// Daily loss cashback: once per local day, refund a slice of net losses since the
// last cashback. Returns the granted { amount } only when something is refunded.
async function grantCashback(
  player: Player,
  tz: string | null
): Promise<{ amount: number } | null> {
  if (!isNewLocalDay(player.last_cashback_at, tz)) return null;
  const since = player.last_cashback_at ?? new Date(Date.now() - 86_400_000).toISOString();

  let refund = 0;
  try {
    const { data: rows } = await supabase
      .from("predictions")
      .select("stake, payout, free_bet")
      .eq("player_id", player.id)
      .neq("status", "PENDING")
      .gte("settled_at", since);
    let net = 0;
    // Free bets risk no coins, so a free-bet loss shouldn't count toward cashback.
    for (const r of rows ?? []) net += (r.payout ?? 0) - (r.free_bet ? 0 : r.stake ?? 0);
    if (net < 0) refund = Math.min(CASHBACK_CAP, Math.round(-net * CASHBACK_PCT));
  } catch {
    return null; // settled_at column missing (schema not run yet) — skip safely
  }

  // Mark processed regardless, so it's strictly once per local day.
  const now = new Date().toISOString();
  await supabase.from("players").update({ last_cashback_at: now }).eq("id", player.id);
  player.last_cashback_at = now;

  if (refund <= 0) return null;
  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: refund });
  player.coins += refund;
  return { amount: refund };
}

// "We missed you" welcome-back gift. Reads/writes last_seen_at defensively so a
// missing column (schema not run yet) can never break the load. The gap since the
// player's previous load is the "time away"; if it's >= WELCOMEBACK_AWAY_HOURS we
// grant the gift once, then stamp "now". Re-armed only by another long absence.
// Returns { giftAmount, awayHours } when the player was away long enough to greet.
async function grantWelcomeBack(
  player: Player
): Promise<{ giftAmount: number; awayHours: number } | null> {
  try {
    const { data } = await supabase
      .from("players")
      .select("last_seen_at")
      .eq("id", player.id)
      .maybeSingle();
    const lastSeen = (data as any)?.last_seen_at as string | null | undefined;
    const now = Date.now();
    const awayHours = lastSeen ? (now - new Date(lastSeen).getTime()) / 3_600_000 : Infinity;

    // Always refresh the heartbeat (no-ops safely if the column is missing).
    await supabase
      .from("players")
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq("id", player.id);

    if (lastSeen == null) return null; // first load — just start the heartbeat
    if (awayHours < WELCOMEBACK_AWAY_HOURS) return null;

    await supabase.rpc("increment_coins", { p_player: player.id, p_amount: WELCOMEBACK_GIFT });
    player.coins += WELCOMEBACK_GIFT;
    return { giftAmount: WELCOMEBACK_GIFT, awayHours: Math.round(awayHours) };
  } catch {
    return null; // last_seen_at column missing — skip safely
  }
}

// GET /api/me?tz=America/New_York -> current player + their predictions.
// `tz` is the player's timezone so daily features reset at their local midnight.
export async function GET(req: Request) {
  const token = req.headers.get("x-player-token");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Tell a genuinely bad token (401 -> sign out) apart from a transient database
  // problem (503 -> the client retries on its next poll WITHOUT logging out).
  const first = await lookupPlayerByToken(token);
  if (first.failed) {
    return NextResponse.json({ error: "Temporary problem, try again." }, { status: 503 });
  }
  if (!first.player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let player = first.player;

  const tz = new URL(req.url).searchParams.get("tz");
  const today = localDate(tz);

  // Settle freshly-finished games while players are online (throttled globally to
  // one feed call per minute), so winnings appear within ~a minute. Best-effort.
  await quickRefresh();
  // Re-read the player so the balance/streak reflect any just-settled bets.
  // If the re-read hits a blip, keep the copy we already have rather than failing.
  const reread = await lookupPlayerByToken(token);
  if (reread.player) player = reread.player;

  // One-time warm-welcome gift (mutates player.coins so balances/popup are live).
  const welcomeGift = await grantWelcomeGift(player);

  // Daily login bonus + daily loss cashback (both once per player's local day).
  const loginBonus = await grantLoginBonus(player, tz, today);
  const cashback = await grantCashback(player, tz);
  // "We missed you" gift for players returning after a long absence (>= 48h).
  const welcomeBack = await grantWelcomeBack(player);

  const { data: predictions } = await supabase
    .from("predictions")
    .select(
      "id, match_id, type, pick, exact_home, exact_away, stake, payout, bonus_mult, boosted, free_bet, status, created_at, matches(home_team, away_team, competition, kickoff_at, status, home_score, away_score, half_home, half_away, home_crest, away_crest, stage)"
    )
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const canBailout =
    player.coins < BAILOUT_FLOOR && isNewLocalDay(player.last_bailout_at, tz);

  const used = spinsUsedToday(player.spin_day, player.spins_today, today);
  const spinsLeft = Math.max(0, MAX_SPINS_PER_DAY - used);
  const nextSpinFree = used === 0;

  const canPenalty = isNewLocalDay(player.last_penalty_at, tz);

  // Community loans board — public by design: every player sees who owes whom.
  // Open loans come first (the borrower's rows get a Repay button client-side),
  // then the most recent repaid ones as greyed-out history. `iOwe` marks the
  // rows the CALLER can act on.
  const { data: loanRows } = await supabase
    .from("loans")
    .select(
      "id, amount, created_at, repaid, repaid_at, borrower_id, lender:lender_id(username), borrower:borrower_id(username)"
    )
    .order("repaid", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50);
  const loansPublic = (loanRows ?? []).map((r: any) => ({
    id: r.id,
    amount: r.amount,
    created_at: r.created_at,
    repaid: r.repaid === true,
    repaid_at: r.repaid_at ?? null,
    lender: r.lender?.username ?? "?",
    borrower: r.borrower?.username ?? "?",
    iOwe: r.borrower_id === player.id && r.repaid !== true,
  }));

  // Community gifts board — public like the loans: the newest ~20 gifts across
  // ALL players ("Dani gifted Ron121 🪙500"), plus an all-time total. Amounts
  // are public; a gift's note/reply THREAD stays private to its two players —
  // `participant` marks the rows the caller may tap open.
  const { data: giftRows } = await supabase
    .from("gifts")
    .select(
      "id, amount, created_at, sender_id, recipient_id, sender:sender_id(username), recipient:recipient_id(username)"
    )
    .order("created_at", { ascending: false })
    .limit(20);
  const giftsPublic = (giftRows ?? []).map((r: any) => ({
    id: r.id,
    amount: r.amount,
    created_at: r.created_at,
    sender: r.sender?.username ?? "?",
    recipient: r.recipient?.username ?? "?",
    participant: r.sender_id === player.id || r.recipient_id === player.id,
  }));
  // All-time coins gifted between players (small table; summing amounts is fine).
  const { data: giftAmts } = await supabase.from("gifts").select("amount").limit(5000);
  const giftsTotal = (giftAmts ?? []).reduce((s: number, r: any) => s + (r.amount || 0), 0);

  // Unread notification count for the header bell badge. The full list is fetched
  // lazily by /api/notifications only when the player opens the inbox.
  const { count: unreadNotifications } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("player_id", player.id)
    .eq("read", false);

  // Serve the leaderboard from here too: /api/me is always dynamic (it reads the
  // player token), so it can't be edge-cached the way the public /api/leaderboard
  // can — guaranteeing live totals and avatars for everyone. Ranked by Net Worth
  // (coins + coins locked in pending bets) so betting never drops your rank.
  const rankedAll = await netWorthLeaderboard(1000);
  const myIndex = rankedAll.findIndex((r) => r.id === player.id);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myInPlay = myIndex >= 0 ? rankedAll[myIndex].inPlay : 0;
  const myNetWorth = myIndex >= 0 ? rankedAll[myIndex].netWorth : player.coins;

  // Comeback wheel: offered only to the bottom slice of the table, and only once it's
  // switched live (admins always see it as a preview). Reuses the rank we just computed;
  // the daily counter lives in app_meta (no schema change).
  const bottomSlice = isComebackEligible(myNetWorth);
  const { comebackLive } = await getEventConfig();
  const { showComeback, showRegular } = comebackAccess(player.is_admin === true, bottomSlice, comebackLive);
  const comebackLeft = showComeback ? await comebackSpinsLeft(player.id, today) : 0;

  // The "you've slipped" comeback alert should only nag players who genuinely DROPPED —
  // i.e. who climbed above the threshold and fell back (or are grandfathered pre-launch
  // accounts). A brand-new player starts in the bottom slice but hasn't dropped, so they
  // still get the comeback wheel above but NOT the alert. Arm the player the moment they
  // rise above the threshold so a future fall is recognised as a real comeback.
  const armed = await isComebackArmed(player.id, player.created_at);
  if (!bottomSlice && !armed) await armComeback(player.id);
  const showComebackAlert = player.is_admin === true ? showComeback : showComeback && armed;

  return NextResponse.json(
    {
      player,
      predictions: predictions ?? [],
      canBailout,
      spinsLeft,
      nextSpinFree,
      showComeback,
      showRegular,
      showComebackAlert,
      comebackSpinsLeft: comebackLeft,
      canPenalty,
      loansPublic,
      giftsPublic,
      giftsTotal,
      unreadNotifications: unreadNotifications ?? 0,
      leaderboard: toPublic(rankedAll.slice(0, 50)),
      myRank,
      myInPlay,
      myNetWorth,
      totalPlayers: rankedAll.length,
      welcomeGift,
      loginBonus,
      cashback,
      welcomeBack,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}

// POST /api/me  { tz } -> low-coins top-up to the floor, once per local day.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* tz optional */
  }

  if (player.coins >= BAILOUT_FLOOR) {
    return NextResponse.json(
      { error: "You still have plenty of coins." },
      { status: 400 }
    );
  }
  if (!isNewLocalDay(player.last_bailout_at, body?.tz)) {
    return NextResponse.json(
      { error: "You already topped up today. Come back tomorrow!" },
      { status: 429 }
    );
  }

  const added = Math.max(0, BAILOUT_AMOUNT - player.coins);
  const { data, error } = await supabase
    .from("players")
    .update({ coins: BAILOUT_AMOUNT, last_bailout_at: new Date().toISOString() })
    .eq("id", player.id)
    .select("coins")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ coins: data.coins, added });
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
