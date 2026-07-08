import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, escapeLike } from "@/lib/auth";
import { MIN_GIFT_AMOUNT } from "@/lib/gift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/gift  { toUsername, amount }
// Gifts coins straight from the caller's balance to another player — given
// outright, never repaid (unlike /api/loan). The recipient gets a notification
// naming the sender, so they always know who the coins came from. A sender can
// never gift more coins than they actually have.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const toUsername = String(body?.toUsername ?? "").trim();
  const amount = Math.floor(Number(body?.amount));

  if (!toUsername) {
    return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < MIN_GIFT_AMOUNT) {
    return NextResponse.json({ error: `Gifts start at 🪙${MIN_GIFT_AMOUNT}.` }, { status: 400 });
  }
  if (player.coins < amount) {
    return NextResponse.json({ error: "You don't have enough coins to gift that much." }, { status: 400 });
  }

  const { data: recipient } = await supabase
    .from("players")
    .select("id, username")
    .ilike("username", escapeLike(toUsername))
    .maybeSingle();
  if (!recipient) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (recipient.id === player.id) {
    return NextResponse.json({ error: "You can't gift coins to yourself." }, { status: 400 });
  }

  // Everything validated — move the coins.
  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: -amount });
  await supabase.rpc("increment_coins", { p_player: recipient.id, p_amount: amount });

  const { error: giftErr } = await supabase.from("gifts").insert({
    sender_id: player.id,
    recipient_id: recipient.id,
    amount,
  });
  if (giftErr) {
    // Roll back the transfer so a broken gifts table can't mint free coins.
    await supabase.rpc("increment_coins", { p_player: player.id, p_amount: amount });
    await supabase.rpc("increment_coins", { p_player: recipient.id, p_amount: -amount });
    return NextResponse.json({ error: "Could not send the gift. Try again." }, { status: 500 });
  }

  // Notify the recipient so they know who gifted them. Best-effort: the coins have
  // already moved, so a failed notification must not fail the whole request.
  await supabase.from("notifications").insert({
    player_id: recipient.id,
    kind: "gift",
    data: { from: player.username, amount },
  });

  return NextResponse.json({ ok: true, amount, toUsername: recipient.username });
}
