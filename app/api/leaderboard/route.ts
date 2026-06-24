import { NextResponse } from "next/server";
import { netWorthLeaderboard, toPublic } from "@/lib/networth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/leaderboard -> top players by Net Worth (coins + coins locked in pending
// bets), so placing a bet never drops your rank — only real outcomes do.
export async function GET() {
  try {
    const ranked = await netWorthLeaderboard(50);
    return NextResponse.json(
      { leaderboard: toPublic(ranked) },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ error: "Could not load leaderboard" }, { status: 500 });
  }
}
