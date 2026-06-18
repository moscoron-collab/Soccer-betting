import { supabase } from "./supabase";

export type Player = {
  id: string;
  username: string;
  coins: number;
  last_bailout_at: string | null;
  created_at: string;
};

// Reads the player's secret token from the request header and returns the player.
// Returns null if the header is missing or the token doesn't match anyone.
export async function getPlayerFromRequest(req: Request): Promise<Player | null> {
  const token = req.headers.get("x-player-token");
  if (!token) return null;

  const { data, error } = await supabase
    .from("players")
    .select("id, username, coins, last_bailout_at, created_at")
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

