import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/matches -> upcoming matches still open for prediction (kickoff in the future)
export async function GET() {
  const { data, error } = await supabase
    .from("matches")
    .select("id, competition, home_team, away_team, kickoff_at, status")
    .eq("status", "SCHEDULED")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: "Could not load matches" }, { status: 500 });
  }
  return NextResponse.json({ matches: data ?? [] });
}
