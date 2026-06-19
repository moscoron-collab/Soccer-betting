import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/matches -> upcoming matches still open for prediction, each with the
// current Winner-bet split (who-wins vote) and who picked what.
export async function GET() {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, competition, home_team, away_team, home_crest, away_crest, kickoff_at, status")
    .eq("status", "SCHEDULED")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: "Could not load matches" }, { status: 500 });
  }

  const list = matches ?? [];
  const ids = list.map((m) => m.id);

  // Winner-market bets across these matches, with usernames.
  const statsByMatch = new Map<
    number,
    { home: number; draw: number; away: number; voters: { username: string; pick: string }[] }
  >();
  if (ids.length > 0) {
    const { data: bets } = await supabase
      .from("predictions")
      .select("match_id, pick, players(username)")
      .eq("type", "WINNER")
      .in("match_id", ids);
    for (const b of bets ?? []) {
      const s =
        statsByMatch.get(b.match_id as number) ?? { home: 0, draw: 0, away: 0, voters: [] };
      if (b.pick === "HOME") s.home++;
      else if (b.pick === "DRAW") s.draw++;
      else if (b.pick === "AWAY") s.away++;
      s.voters.push({ username: (b as any).players?.username ?? "Player", pick: b.pick as string });
      statsByMatch.set(b.match_id as number, s);
    }
  }

  const withStats = list.map((m) => ({
    ...m,
    bet_stats: statsByMatch.get(m.id) ?? { home: 0, draw: 0, away: 0, voters: [] },
  }));

  return NextResponse.json({ matches: withStats });
}
