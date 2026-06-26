// "Comeback wheel" plumbing: who's eligible (bottom slice of the leaderboard) and
// how many free catch-up spins they have left today. The daily counter is stored in
// app_meta (one row per player, value = the local date of their last comeback spin),
// so this feature needs NO schema change — same pattern the app already uses for its
// throttles/snapshots.

import { supabase } from "./supabase";
import { netWorthLeaderboard } from "./networth";
import { isComebackEligible, MAX_COMEBACK_SPINS_PER_DAY } from "./wheel";

const keyFor = (playerId: string) => `cbspin:${playerId}`;

// Which wheel(s) a player sees/can use. Admins always see BOTH, so they can preview the
// Comeback Wheel without losing their own (and before it's live). Real players are split
// strictly: the eligible bottom slice gets ONLY the comeback wheel once it's live;
// everyone else gets ONLY the regular wheel.
export function comebackAccess(
  isAdmin: boolean,
  bottomSlice: boolean,
  comebackLive: boolean
): { showComeback: boolean; showRegular: boolean } {
  if (isAdmin) return { showComeback: true, showRegular: true };
  const inComeback = bottomSlice && comebackLive;
  return { showComeback: inComeback, showRegular: !inComeback };
}

// A player's rank (1-based), the field size, and whether they're in the eligible
// bottom slice — computed from the same Net Worth board the leaderboard uses.
export async function comebackStatus(
  playerId: string
): Promise<{ eligible: boolean; rank: number | null; total: number }> {
  const ranked = await netWorthLeaderboard(1000);
  const idx = ranked.findIndex((r) => r.id === playerId);
  const rank = idx >= 0 ? idx + 1 : null;
  const total = ranked.length;
  const netWorth = idx >= 0 ? ranked[idx].netWorth : 0;
  return { eligible: isComebackEligible(netWorth), rank, total };
}

// How many comeback spins this player has used today. The app_meta value is stored as
// "YYYY-MM-DD:count"; a stored date that isn't today means none used yet today.
function usedToday(value: string | null | undefined, today: string): number {
  if (!value) return 0;
  const [day, n] = String(value).split(":");
  if (day !== today) return 0;
  const c = Number(n);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

// Comeback spins still available to this player today (0 once they've used today's quota).
export async function comebackSpinsLeft(playerId: string, today: string): Promise<number> {
  const { data } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", keyFor(playerId))
    .maybeSingle();
  return Math.max(0, MAX_COMEBACK_SPINS_PER_DAY - usedToday((data as any)?.value, today));
}

// Record that the player has taken a comeback spin today (increments today's counter).
export async function markComebackSpin(playerId: string, today: string): Promise<void> {
  const { data } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", keyFor(playerId))
    .maybeSingle();
  const next = usedToday((data as any)?.value, today) + 1;
  await supabase
    .from("app_meta")
    .upsert({ key: keyFor(playerId), value: `${today}:${next}`, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
