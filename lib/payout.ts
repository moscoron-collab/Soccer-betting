// Scoring / coin rules for V1. Tweak these freely — they're the "game balance".

export const WINNER_MULTIPLIER = 2; // correct winner/draw returns 2x the stake
export const EXACT_MULTIPLIER = 5; // correct exact score returns 5x the stake
export const HALFTIME_MULTIPLIER = 2; // correct half-time leader returns 2x the stake
export const GOALS3_MULTIPLIER = 2; // correct "3+ goals" returns 2x the stake

export const STARTING_COINS = 1000;
export const BAILOUT_FLOOR = 100; // if you drop below this you can top up once a day
export const BAILOUT_AMOUNT = 100;

export const MOTD_BONUS = 0.5; // extra multiplier added for the Match of the Day
export const MAX_BONUS = 3; // cap on the total bonus multiplier

export type PredictionType = "WINNER" | "EXACT" | "HALFTIME" | "GOALS3";
export type WinnerPick = "HOME" | "DRAW" | "AWAY";

export function baseMultiplier(type: PredictionType): number {
  if (type === "EXACT") return EXACT_MULTIPLIER;
  return WINNER_MULTIPLIER; // WINNER / HALFTIME / GOALS3 all 2x
}

// Underdog bonus: the fewer players who backed your pick, the bigger the bonus.
// `share` is the fraction (0–1) of the crowd that backed the same pick.
//   share 0   -> 2.0x   (very contrarian)
//   share ~0.67+ -> 1.0x (popular pick, no bonus)
export function underdogBonus(share: number): number {
  const b = 2 - 1.5 * share;
  return Math.max(1, Math.min(2, Math.round(b * 100) / 100));
}

export function resultFromScore(home: number, away: number): WinnerPick {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

// Returns the payout (coins returned to the player) for a settled prediction.
// Stake was deducted at placement, so a win returns stake * base * bonus, a loss 0.
export function computePayout(
  type: PredictionType,
  pick: string | null,
  exactHome: number | null,
  exactAway: number | null,
  stake: number,
  homeScore: number,
  awayScore: number,
  halfHome: number | null,
  halfAway: number | null,
  bonusMult: number = 1
): { won: boolean; payout: number } {
  let won = false;
  if (type === "WINNER") {
    won = pick === resultFromScore(homeScore, awayScore);
  } else if (type === "HALFTIME") {
    // Missing half-time data is treated as 0–0.
    won = pick === resultFromScore(halfHome ?? 0, halfAway ?? 0);
  } else if (type === "GOALS3") {
    won = pick === (homeScore + awayScore >= 3 ? "YES" : "NO");
  } else {
    won = exactHome === homeScore && exactAway === awayScore;
  }

  const payout = won ? Math.round(stake * baseMultiplier(type) * bonusMult) : 0;
  return { won, payout };
}

