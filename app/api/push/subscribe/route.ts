import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/push/subscribe { subscription } -> save this device's push subscription.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  // Upsert by endpoint so re-subscribing (or a new owner of the device) is fine.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint, player_id: player.id, p256dh, auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/push/subscribe { endpoint } -> remove a subscription (turn off).
export async function DELETE(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const endpoint = String(body?.endpoint ?? "");
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("player_id", player.id);
  return NextResponse.json({ ok: true });
}
