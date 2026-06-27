import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/login  { username, password }  -> returns the session token if correct.
// Accounts created before passwords existed (password_hash is null) get their
// password set on first login ("claim").
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const deviceId = String(body?.deviceId ?? "").trim();
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, username, coins, secret_token, password_hash, device_id")
    .ilike("username", escapeLike(username))
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: "No account with that username." }, { status: 404 });
  }

  if (!player.password_hash) {
    // Legacy passwordless account — set the password they just chose.
    const { error } = await supabase
      .from("players")
      .update({ password_hash: hashPassword(password) })
      .eq("id", player.id);
    if (error) return NextResponse.json({ error: "Try again." }, { status: 500 });
  } else if (!verifyPassword(password, player.password_hash)) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  // Claim this device for the account if it doesn't have one yet (grandfathers
  // legacy accounts onto the "one device = one account" rule going forward).
  // Skip if another account already claimed this device — shared family devices
  // keep working; we just never block an existing login. Best-effort.
  if (deviceId && !player.device_id) {
    const { data: claimed } = await supabase
      .from("players")
      .select("id")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (!claimed) {
      await supabase.from("players").update({ device_id: deviceId }).eq("id", player.id);
    }
  }

  return NextResponse.json({
    token: player.secret_token,
    player: { id: player.id, username: player.username, coins: player.coins },
  });
}
