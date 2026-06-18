import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";
import { STARTING_COINS } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/players  { username }  -> creates a player, returns token (= recovery code)
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body?.username ?? "").trim();
  if (username.length < 2 || username.length > 20) {
    return NextResponse.json(
      { error: "Username must be 2–20 characters." },
      { status: 400 }
    );
  }
  if (!/^[a-zA-Z0-9_ -]+$/.test(username)) {
    return NextResponse.json(
      { error: "Use only letters, numbers, spaces, _ or -." },
      { status: 400 }
    );
  }

  // Is the name taken?
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That username is taken — try another." },
      { status: 409 }
    );
  }

  const token = randomUUID() + randomUUID().replace(/-/g, "");
  const { data, error } = await supabase
    .from("players")
    .insert({ username, secret_token: token, coins: STARTING_COINS })
    .select("id, username, coins")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Could not create player. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    token, // the browser stores this; it is also the recovery code
    player: { id: data.id, username: data.username, coins: data.coins },
  });
}
