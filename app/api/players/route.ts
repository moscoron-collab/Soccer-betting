import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { STARTING_COINS } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/players  { username, password }  -> creates a player, returns a session token
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (username.length < 2 || username.length > 20) {
    return NextResponse.json({ error: "Username must be 2–20 characters." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_ -]+$/.test(username)) {
    return NextResponse.json({ error: "Use only letters, numbers, spaces, _ or -." }, { status: 400 });
  }
  if (password.length < 4 || password.length > 50) {
    return NextResponse.json({ error: "Password must be at least 4 characters." }, { status: 400 });
  }

  // Is the name taken? (exact, case-insensitive)
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .ilike("username", escapeLike(username))
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That username is taken. If it's yours, use Log in instead." },
      { status: 409 }
    );
  }

  const token = randomUUID() + randomUUID().replace(/-/g, "");
  const { data, error } = await supabase
    .from("players")
    .insert({
      username,
      secret_token: token,
      password_hash: hashPassword(password),
      coins: STARTING_COINS,
    })
    .select("id, username, coins")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not create player. Try again." }, { status: 500 });
  }

  // Announce the new player in the chat lobby (rendered as a friendly system
  // greeting, translated client-side). Best-effort — never block signup on it.
  await supabase.from("messages").insert({ player_id: data.id, body: data.username, kind: "join" });

  return NextResponse.json({
    token,
    player: { id: data.id, username: data.username, coins: data.coins },
  });
}
