import { supabase } from "./supabase";

export type Player = {
  id: string;
  username: string;
  coins: number;
  xp: number;
  win_streak: number;
  last_bailout_at: string | null;
  last_spin_at: string | null;
  last_penalty_at: string | null;
  avatar: string | null;
  hide_picks: boolean;
  boost_2x: number;
  streak_shield: number;
  created_at: string;
};

// Reads the player's secret token from the request header and returns the player.
// Returns null if the header is missing or the token doesn't match anyone.
export async function getPlayerFromRequest(req: Request): Promise<Player | null> {
  const token = req.headers.get("x-player-token");
  if (!token) return null;

  const { data, error } = await supabase
    .from("players")
    .select(
      "id, username, coins, xp, win_streak, last_bailout_at, last_spin_at, last_penalty_at, avatar, hide_picks, boost_2x, streak_shield, created_at"
    )
    .eq("secret_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as Player;
}

// Escapes LIKE wildcards so an exact (case-insensitive) username match via ilike
// can't be fooled by "%" or "_" in a name.
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

