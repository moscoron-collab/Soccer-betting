import { supabase } from "./supabase";
import { PredictionType, underdogBonus, MOTD_BONUS, MAX_BONUS } from "./payout";

// Computes the bonus multiplier locked in when a bet is placed:
//   underdog bonus (based on the current crowd split) + Match of the Day bonus.
// Returns 1 when there isn't enough of a crowd yet to judge (avoids gaming).
export async function computeBonusMult(
  matchId: number,
  type: PredictionType,
  pick: string | null
): Promise<number> {
  let bonus = 1;

  // Underdog bonus for any pick-based market (everything except EXACT).
  if (type !== "EXACT" && pick) {
    const { data } = await supabase
      .from("predictions")
      .select("pick")
      .eq("match_id", matchId)
      .eq("type", type);
    const rows = data ?? [];
    if (rows.length >= 3) {
      const same = rows.filter((r) => r.pick === pick).length;
      bonus = underdogBonus(same / rows.length);
    }
  }

  // Match of the Day = the soonest upcoming match.
  const { data: motd } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "SCHEDULED")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (motd && motd.id === matchId) bonus += MOTD_BONUS;

  return Math.min(MAX_BONUS, Math.round(bonus * 100) / 100);
}
