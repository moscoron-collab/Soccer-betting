// Scoring / coin rules for V1. Tweak these freely — they're the "game balance".

export const WINNER_MULTIPLIER = 2; // correct winner/draw returns 2x the stake
export const EXACT_MULTIPLIER = 5; // correct exact score returns 5x the stake
export const HALFTIME_MULTIPLIER = 2; // correct half-time leader returns 2x the stake
export const GOALS3_MULTIPLIER = 2; // correct "3+ goals" returns 2x the stake

export const STARTING_COINS = 1000;
export const BAILOUT_FLOOR = 100; // if you drop below this you can top up once a day
export const BAILOUT_AMOUNT = 100;

export type PredictionType = "WINNER" | "EXACT" | "HALFTIME" | "GOALS3";
export type WinnerPick = "HOME" | "DRAW" | "AWAY";

export function resultFromScore(home: number, away: number): WinnerPick {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

// Returns the payout (coins returned to the player) for a settled prediction.
// Stake was already deducted when the prediction was placed, so:
//   - a win returns stake * multiplier (net gain = stake * (multiplier - 1))
//   - a loss returns 0
export function computePayout(
  type: PredictionType,
  pick: string | null,
  exactHome: number | null,
  exactAway: number | null,
  stake: number,
  homeScore: number,
  awayScore: number,
  halfHome: number | null,
  halfAway: number | null
): { won: boolean; payout: number } {
  if (type === "WINNER") {
    const actual = resultFromScore(homeScore, awayScore);
    const won = pick === actual;
    return { won, payout: won ? stake * WINNER_MULTIPLIER : 0 };
  }

  if (type === "HALFTIME") {
    // Who was leading at half-time. Missing half-time data is treated as 0–0.
    const actual = resultFromScore(halfHome ?? 0, halfAway ?? 0);
    const won = pick === actual;
    return { won, payout: won ? stake * HALFTIME_MULTIPLIER : 0 };
  }

  if (type === "GOALS3") {
    // Were there 3 or more total goals? pick is "YES" or "NO".
    const actual = homeScore + awayScore >= 3 ? "YES" : "NO";
    const won = pick === actual;
    return { won, payout: won ? stake * GOALS3_MULTIPLIER : 0 };
  }

  // EXACT
  const won = exactHome === homeScore && exactAway === awayScore;
  return { won, payout: won ? stake * EXACT_MULTIPLIER : 0 };
}
