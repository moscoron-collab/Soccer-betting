import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/match-bets?matchId=123
// Returns everyone's predictions on a match (with usernames) plus a Home/Draw/Away tally.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = Number(url.searchParams.get("matchId"));
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Missing match" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("predictions")
    .select("type, pick, exact_home, exact_away, stake, created_at, players(username)")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load bets" }, { status: 500 });
  }

  const bets = (data ?? []).map((b: any) => ({
    username: b.players?.username ?? "Player",
    type: b.type,
    pick: b.pick,
    exact_home: b.exact_home,
    exact_away: b.exact_away,
    stake: b.stake,
  }));

  // Home/Draw/Away split from Winner and Half-time picks.
  const counts = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const b of bets) {
    if ((b.type === "WINNER" || b.type === "HALFTIME") && b.pick && b.pick in counts) {
      counts[b.pick as "HOME" | "DRAW" | "AWAY"]++;
    }
  }

  return NextResponse.json({ bets, counts, total: bets.length });
}
