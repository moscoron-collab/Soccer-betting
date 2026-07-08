import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { vapidPublicKey, pushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/push -> the VAPID public key the browser needs to subscribe. Served
// from here (not a NEXT_PUBLIC var) so rotating the key needs no client rebuild.
export async function GET() {
  return NextResponse.json(
    { publicKey: vapidPublicKey(), enabled: pushConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/push { subscription } -> save (or refresh) this device's push
// subscription for the signed-in player. Endpoint is unique, so the same device
// re-subscribing just updates its keys.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { player_id: player.id, endpoint, p256dh, auth },
      { onConflict: "endpoint" }
    );
  if (error) {
    // 42P01 = table doesn't exist — schema.sql hasn't been re-run since push was
    // added. Surface a distinct code so the (admin-only) UI can say exactly that.
    const missingTable = (error as any)?.code === "42P01";
    return NextResponse.json(
      { error: missingTable ? "DB_MISSING" : "Could not save. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/push { endpoint } -> unsubscribe this device.
export async function DELETE(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const endpoint = String(body?.endpoint ?? "");
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("player_id", player.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
