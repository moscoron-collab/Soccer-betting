import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { cleanMessage } from "@/lib/chat";
import { sendPushToPlayer } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loads a gift plus who's on each side, but only if the caller is one of the two
// participants. Returns null when the gift is missing or the caller isn't part
// of it (so we never leak other people's conversations).
async function loadGiftForParticipant(giftId: string, playerId: string) {
  if (!giftId) return null;
  const { data: gift } = await supabase
    .from("gifts")
    .select("id, amount, sender_id, recipient_id, sender:sender_id(username), recipient:recipient_id(username)")
    .eq("id", giftId)
    .maybeSingle();
  if (!gift) return null;
  if (gift.sender_id !== playerId && gift.recipient_id !== playerId) return null;
  return gift as any;
}

// GET /api/gift/thread?giftId=... -> the full note+reply conversation for a gift,
// oldest first, with each message flagged `mine`. Participants only.
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const giftId = new URL(req.url).searchParams.get("giftId") ?? "";
  const gift = await loadGiftForParticipant(giftId, player.id);
  if (!gift) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const iAmSender = gift.sender_id === player.id;
  const otherName = (iAmSender ? gift.recipient?.username : gift.sender?.username) ?? "?";

  const { data: rows } = await supabase
    .from("gift_messages")
    .select("id, sender_id, body, created_at")
    .eq("gift_id", gift.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const messages = (rows ?? []).map((m: any) => ({
    id: m.id,
    mine: m.sender_id === player.id,
    body: m.body,
    created_at: m.created_at,
  }));

  return NextResponse.json(
    { giftId: gift.id, amount: gift.amount, iAmSender, otherName, messages },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/gift/thread  { giftId, body } -> add a reply to a gift's thread and
// notify the other participant. Participants only; body is kid-safe filtered.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const giftId = String(body?.giftId ?? "").trim();
  const gift = await loadGiftForParticipant(giftId, player.id);
  if (!gift) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const cleaned = cleanMessage(body?.body);
  if (!cleaned.ok) {
    const msg =
      cleaned.code === "TOO_LONG"
        ? "That message is too long."
        : cleaned.code === "NO_LINKS"
        ? "Messages can't contain links or phone numbers."
        : "Type a message first.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("gift_messages").insert({
    gift_id: gift.id,
    sender_id: player.id,
    body: cleaned.text,
  });
  if (insErr) {
    return NextResponse.json({ error: "Could not send. Try again." }, { status: 500 });
  }

  // Notify the other side that a reply landed on this gift's thread.
  const otherId = gift.sender_id === player.id ? gift.recipient_id : gift.sender_id;
  await supabase.from("notifications").insert({
    player_id: otherId,
    kind: "gift_reply",
    data: { from: player.username, giftId: gift.id },
  });

  // Phone push (best-effort).
  await sendPushToPlayer(otherId, {
    title: "💬 New reply",
    body: `${player.username}: ${cleaned.text}`,
    tag: `gift-${gift.id}`,
  });

  return NextResponse.json({ ok: true });
}
