import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { cleanMessage, RATE_MAX, RATE_WINDOW_MS } from "@/lib/chat";
import { sendChatPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type Row = {
  id: string;
  body: string;
  kind: string;
  created_at: string;
  player_id: string;
  players: { username: string; avatar: string | null } | null;
};

// GET /api/chat -> the latest messages (oldest→newest) + who the viewer is.
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("messages")
    .select("id, body, kind, created_at, player_id, players(username, avatar)")
    .eq("deleted", false)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = ((data ?? []) as unknown as Row[]).reverse(); // show oldest first
  const messages = rows.map((m) => ({
    id: m.id,
    body: m.body,
    kind: m.kind ?? "user",
    created_at: m.created_at,
    player_id: m.player_id,
    username: m.players?.username ?? "?",
    avatar: m.players?.avatar ?? null,
  }));

  return NextResponse.json(
    { messages, viewer: { id: player.id, isAdmin: player.is_admin } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/chat { body } -> send a message (validated, filtered, rate-limited).
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clean = cleanMessage(payload?.body);
  if (!clean.ok) return NextResponse.json({ error: clean.code, code: clean.code }, { status: 400 });

  // Anti-spam: cap messages per player within a sliding window.
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("player_id", player.id)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_MAX) {
    return NextResponse.json({ error: "RATE", code: "RATE" }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ player_id: player.id, body: clean.text })
    .select("id, body, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "Try again." }, { status: 500 });

  // Notify other players' phones (best-effort; no-ops if push isn't configured).
  await sendChatPush(player.id, player.username, clean.text);

  return NextResponse.json({ ok: true, message: data });
}

// DELETE /api/chat { id } -> soft-delete a message (author or moderator only).
export async function DELETE(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(payload?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: msg } = await supabase
    .from("messages")
    .select("id, player_id")
    .eq("id", id)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (msg.player_id !== player.id && !player.is_admin) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { error } = await supabase.from("messages").update({ deleted: true }).eq("id", id);
  if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
