import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/player?username=Alice
// Public profile + bet log for any player. If that player has chosen to hide
// their picks, their still-upcoming (pre-kickoff) bets are left out.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = String(url.searchParams.get("username") ?? "").trim();
  if (!username) {
    return NextResponse.json({ error: "Missing player" }, { status: 400 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, username, avatar, coins, xp, win_streak, hide_picks, created_at")
    .ilike("username", escapeLike(username))
    .maybeSingle();
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("predictions")
    .select(
      "id, match_id, type, pick, exact_home, exact_away, stake, payout, bonus_mult, boosted, status, created_at, matches(home_team, away_team, competition, kickoff_at, status, home_score, away_score, half_home, half_away, home_crest, away_crest)"
    )
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(50);

  let predictions = rows ?? [];
  if (player.hide_picks) {
    const now = Date.now();
    predictions = predictions.filter((p: any) => {
      const ko = p.matches?.kickoff_at ? new Date(p.matches.kickoff_at).getTime() : 0;
      // Hide bets whose match hasn't kicked off yet; reveal once it has.
      return !(p.status === "PENDING" && ko > now);
    });
  }

  const wins = predictions.filter((p: any) => p.status === "WON").length;
  const losses = predictions.filter((p: any) => p.status === "LOST").length;

  return NextResponse.json({
    player: {
      username: player.username,
      avatar: player.avatar,
      coins: player.coins,
      xp: player.xp,
      win_streak: player.win_streak,
      hide_picks: player.hide_picks,
      created_at: player.created_at,
    },
    predictions,
    wins,
    losses,
  });
}
