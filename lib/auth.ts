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
  free_bets: number;
  pending_gamble: number;
  spin_day: string | null;
  spins_today: number;
  is_admin: boolean;
  login_streak: number;
  last_login_day: string | null;
  last_cashback_at: string | null;
  created_at: string;
};

const PLAYER_COLUMNS =
  "id, username, coins, xp, win_streak, last_bailout_at, last_spin_at, last_penalty_at, avatar, hide_picks, boost_2x, streak_shield, free_bets, pending_gamble, spin_day, spins_today, is_admin, login_streak, last_login_day, last_cashback_at, created_at";

// Looks up a player by session token, distinguishing a genuine "no such token"
// (player: null, failed: false) from a transient database error (failed: true).
// Retries once on error so a brief Supabase blip under load doesn't look like a
// bad token (which would otherwise log the player out).
export async function lookupPlayerByToken(
  token: string
): Promise<{ player: Player | null; failed: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("secret_token", token)
      .maybeSingle();
    if (!error) return { player: (data as Player) ?? null, failed: false };
    if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
  }
  return { player: null, failed: true };
}

// Reads the player's secret token from the request header and returns the player.
// Returns null if the header is missing or the token doesn't match anyone (or on
// a database error — callers that must tell those apart should use
// lookupPlayerByToken directly).
export async function getPlayerFromRequest(req: Request): Promise<Player | null> {
  const token = req.headers.get("x-player-token");
  if (!token) return null;
  const { player } = await lookupPlayerByToken(token);
  return player;
}

// Escapes LIKE wildcards so an exact (case-insensitive) username match via ilike
// can't be fooled by "%" or "_" in a name.
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

