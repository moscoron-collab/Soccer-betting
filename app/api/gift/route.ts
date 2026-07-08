import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, escapeLike } from "@/lib/auth";
import { MIN_GIFT_AMOUNT } from "@/lib/gift";
import { cleanMessage } from "@/lib/chat";
import { sendPushToPlayer } from "@/lib/push";

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

  // Optional personal note. When present it's kid-safe filtered exactly like a
  // chat message (profanity mask, no links/phone numbers, length cap) and becomes
  // the first message of the gift's reply thread.
  const rawNote = body?.note;
  let note: string | null = null;
  if (rawNote != null && String(rawNote).trim() !== "") {
    const cleaned = cleanMessage(rawNote);
    if (!cleaned.ok) {
      const msg =
        cleaned.code === "TOO_LONG"
          ? "That note is too long."
          : cleaned.code === "NO_LINKS"
          ? "Notes can't contain links or phone numbers."
          : "That note can't be sent.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    note = cleaned.text;
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

  const { data: gift, error: giftErr } = await supabase
    .from("gifts")
    .insert({
      sender_id: player.id,
      recipient_id: recipient.id,
      amount,
    })
    .select("id")
    .single();
  if (giftErr || !gift) {
    // Roll back the transfer so a broken gifts table can't mint free coins.
    await supabase.rpc("increment_coins", { p_player: player.id, p_amount: amount });
    await supabase.rpc("increment_coins", { p_player: recipient.id, p_amount: -amount });
    return NextResponse.json({ error: "Could not send the gift. Try again." }, { status: 500 });
  }

  // The note (if any) is the first message of the gift's conversation thread.
  if (note) {
    await supabase.from("gift_messages").insert({
      gift_id: gift.id,
      sender_id: player.id,
      body: note,
    });
  }

  // Notify the recipient so they know who gifted them (and can open the thread to
  // read the note / reply). Best-effort: the coins have already moved, so a failed
  // notification must not fail the whole request.
  await supabase.from("notifications").insert({
    player_id: recipient.id,
    kind: "gift",
    data: { from: player.username, amount, giftId: gift.id, note: note ?? undefined },
  });

  // Phone push (best-effort; no-ops if push isn't configured or they haven't opted in).
  await sendPushToPlayer(recipient.id, {
    title: "🎁 You got a gift!",
    body: note
      ? `${player.username} gifted you 🪙${amount.toLocaleString()}: "${note}"`
      : `${player.username} gifted you 🪙${amount.toLocaleString()}`,
    tag: `gift-${gift.id}`,
  });

  return NextResponse.json({ ok: true, amount, toUsername: recipient.username });
}
