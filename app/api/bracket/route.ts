import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildBracket, MatchRow } from "@/lib/bracket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bracket -> the live "Road to the Final" knockout bracket, built from the
// World Cup matches mirrored into our table. Read-only: every team/score/status
// comes from the football-data feed.
export async function GET() {
  try {
    // World Cup rows only. We store the competition NAME ("FIFA World Cup") from the
    // feed; match it loosely and also accept the bare "WC" code as a fallback.
    const { data, error } = await supabase
      .from("matches")
      .select(
        "id, home_team, away_team, home_crest, away_crest, home_score, away_score, status, stage, winner, kickoff_at"
      )
      .or("competition.ilike.%World Cup%,competition.eq.WC")
      .order("kickoff_at", { ascending: true })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: "Could not load bracket" }, { status: 500 });
    }

    const bracket = buildBracket((data ?? []) as MatchRow[]);
    return NextResponse.json(
      { bracket },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ error: "Could not load bracket" }, { status: 500 });
  }
}
