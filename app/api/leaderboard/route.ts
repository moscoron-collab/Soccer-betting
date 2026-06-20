import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/leaderboard -> top players by coin balance
export async function GET() {
  const { data, error } = await supabase
    .from("players")
    .select("username, coins, avatar")
    .order("coins", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Could not load leaderboard" }, { status: 500 });
  }
  return NextResponse.json(
    { leaderboard: data ?? [] },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
