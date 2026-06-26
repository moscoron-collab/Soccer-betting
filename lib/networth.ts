// "Net Worth" leaderboard ranking. A player's true standing is their liquid coins
// PLUS the coins locked in pending (unsettled) bets — otherwise placing a bet would
// make you drop on the leaderboard even though you haven't lost anything. So we rank
// by coins + in-play stake, and only real outcomes (wins/losses) move you.
//
// Computed in JS (not a SQL view) so it has no schema dependency and can't break the
// live site: it only reads tables/columns that already exist.

import { supabase } from "./supabase";

export type RankedPlayer = {
  id: string;
  username: string;
  coins: number; // liquid balance
  inPlay: number; // coins locked in pending bets
  netWorth: number; // coins + inPlay (the ranking value)
  avatar: string | null;
  created_at: string | null;
  xp: number; // drives the leaderboard tier emoji
};

// All players ranked by Net Worth, biggest first (tie-break: more liquid coins).
// The player pool is small (~tens), so a full scan + JS aggregation is cheap.
export async function netWorthLeaderboard(limit = 50): Promise<RankedPlayer[]> {
  const { data: players } = await supabase
    .from("players")
    .select("id, username, coins, avatar, created_at, xp")
    .limit(1000);

  const { data: pending } = await supabase
    .from("predictions")
    .select("player_id, stake")
    .eq("status", "PENDING");

  const inPlayByPlayer = new Map<string, number>();
  for (const p of pending ?? []) {
    inPlayByPlayer.set(p.player_id, (inPlayByPlayer.get(p.player_id) ?? 0) + (p.stake ?? 0));
  }

  const ranked: RankedPlayer[] = (players ?? []).map((p: any) => {
    const inPlay = inPlayByPlayer.get(p.id) ?? 0;
    return {
      id: p.id,
      username: p.username,
      coins: p.coins,
      inPlay,
      netWorth: p.coins + inPlay,
      avatar: p.avatar ?? null,
      created_at: p.created_at ?? null,
      xp: p.xp ?? 0,
    };
  });

  ranked.sort((a, b) => b.netWorth - a.netWorth || b.coins - a.coins);
  return ranked.slice(0, limit);
}

// The public leaderboard shape (no internal id). Net Worth is what's ranked; we also
// expose coins + inPlay so the UI can show "9,000 (+1,000 in play)".
export function toPublic(rows: RankedPlayer[]) {
  return rows.map(({ id, ...rest }) => rest);
}
