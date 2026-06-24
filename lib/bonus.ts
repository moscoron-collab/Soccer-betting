import { supabase } from "./supabase";
import { PredictionType, underdogBonus, MOTD_BONUS, MAX_BONUS, baseMultiplier } from "./payout";
import { getMotdId } from "./motd";
import { getEventConfig, getFeaturedMatchIds } from "./event";

// Computes the bonus multiplier locked in when a bet is placed:
//   underdog bonus (based on the current crowd split) + Match of the Day bonus.
// Returns 1 when there isn't enough of a crowd yet to judge (avoids gaming).
// `tz` is the player's timezone, used to pick their Match of the Day.
//
// EXCEPTION — the Road-to-the-Final event: while the event is on, a Winner bet on
// the (global) featured match pays exactly the configured featured multiplier. We
// express that as bonus = featuredMult / baseWinner, so settle's stake*base*bonus
// lands on the headline rate. This replaces (doesn't stack with) the usual bonuses
// for that one market, keeping "Featured: Winner pays X×" literally true.
export async function computeBonusMult(
  matchId: number,
  type: PredictionType,
  pick: string | null,
  tz: string | null | undefined
): Promise<number> {
  try {
    const cfg = await getEventConfig();
    if (cfg.eventOn && type === "WINNER") {
      const featuredIds = await getFeaturedMatchIds(cfg);
      if (featuredIds.includes(matchId)) {
        const featuredBonus = cfg.featuredMult / baseMultiplier("WINNER");
        return Math.min(MAX_BONUS, Math.round(featuredBonus * 100) / 100);
      }
    }
  } catch {
    /* event off or config unavailable — fall through to the normal bonus */
  }

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

  // Match of the Day bonus (one fixed match per the player's local day).
  const motdId = await getMotdId(tz);
  if (motdId === matchId) bonus += MOTD_BONUS;

  return Math.min(MAX_BONUS, Math.round(bonus * 100) / 100);
}
