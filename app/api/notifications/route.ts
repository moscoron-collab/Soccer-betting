import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notifications -> the signed-in player's recent notifications (newest
// first) plus an unread count. Each item carries `kind` + `data`; the text is
// built client-side so it stays translatable (see lib/i18n).
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, data, read, created_at")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = (data ?? []).map((n: any) => ({
    id: n.id,
    kind: n.kind,
    data: n.data ?? {},
    read: n.read === true,
    created_at: n.created_at,
  }));
  const unread = items.filter((n) => !n.read).length;

  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/notifications -> mark the player's notifications read. By default all
// of them; pass { ids: [...] } to mark only a specific set. Called when the
// player opens the inbox so the header bell badge clears.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine — treat it as "mark everything read".
  }
  const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => String(x)) : null;

  let q = supabase
    .from("notifications")
    .update({ read: true })
    .eq("player_id", player.id)
    .eq("read", false);
  if (ids && ids.length) q = q.in("id", ids);
  await q;

  return NextResponse.json({ ok: true });
}
