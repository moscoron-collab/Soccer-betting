// Scoring / coin rules for V1. Tweak these freely — they're the "game balance".

export const WINNER_MULTIPLIER = 2; // correct winner/draw returns 2x the stake
export const EXACT_MULTIPLIER = 5; // correct exact score returns 5x the stake
export const HALFTIME_MULTIPLIER = 2; // correct half-time leader returns 2x the stake
export const GOALS3_MULTIPLIER = 2; // correct "3+ goals" returns 2x the stake
export const BTTS_MULTIPLIER = 2; // correct "both teams to score" returns 2x
export const TOTALS_MULTIPLIER = 3; // correct total-goals band returns 3x

export const STARTING_COINS = 1000;
// Low-balance help: if you're below the floor you can top up to it once a day.
export const BAILOUT_FLOOR = 500;
export const BAILOUT_AMOUNT = 500;

// Daily loss cashback: a slice of your net losses refunded once a day, capped.
export const CASHBACK_PCT = 0.15;
export const CASHBACK_CAP = 1000;

// Daily login bonus by consecutive-day streak (index 1..7+, capped at day 7).
export const LOGIN_BONUS = [0, 50, 75, 100, 125, 150, 175, 200] as const;
export function loginBonusFor(streakDay: number): number {
  return LOGIN_BONUS[Math.min(Math.max(streakDay, 1), 7)];
}

export const MOTD_BONUS = 0.5; // extra multiplier added for the Match of the Day
export const MAX_BONUS = 3; // cap on the total bonus multiplier

export const BOOST_MULTIPLIER = 2; // a "2x payout" power-up doubles a winning bet

// A "free bet" token (won from the wheel) places a bet at this fixed stake with no
// coins risked: a win pays the full payout, a loss costs nothing.
export const FREE_BET_STAKE = 100;

export type PredictionType = "WINNER" | "EXACT" | "HALFTIME" | "GOALS3" | "BTTS" | "TOTALS";
export type WinnerPick = "HOME" | "DRAW" | "AWAY";

export function baseMultiplier(type: PredictionType): number {
  if (type === "EXACT") return EXACT_MULTIPLIER;
  if (type === "TOTALS") return TOTALS_MULTIPLIER;
  return WINNER_MULTIPLIER; // WINNER / HALFTIME / GOALS3 / BTTS all 2x
}

// Total-goals band for the TOTALS market.
export function goalsBand(total: number): "0-1" | "2-3" | "4+" {
  if (total <= 1) return "0-1";
  if (total <= 3) return "2-3";
  return "4+";
}

export const BET_TYPES: PredictionType[] = [
  "WINNER",
  "EXACT",
  "HALFTIME",
  "GOALS3",
  "BTTS",
  "TOTALS",
];

// Validates a single selection (used by single bets and parlay legs).
export function validateSelection(
  type: any,
  rawPick: any,
  rawExactHome: any,
  rawExactAway: any
):
  | { ok: true; type: PredictionType; pick: string | null; exactHome: number | null; exactAway: number | null }
  | { ok: false; error: string } {
  if (!BET_TYPES.includes(type)) return { ok: false, error: "Invalid prediction type" };

  let pick: string | null = null;
  let exactHome: number | null = null;
  let exactAway: number | null = null;

  if (type === "WINNER" || type === "HALFTIME") {
    pick = rawPick;
    if (!["HOME", "DRAW", "AWAY"].includes(pick ?? "")) {
      return { ok: false, error: "Pick HOME, DRAW or AWAY" };
    }
  } else if (type === "GOALS3" || type === "BTTS") {
    pick = rawPick;
    if (!["YES", "NO"].includes(pick ?? "")) return { ok: false, error: "Pick YES or NO" };
  } else if (type === "TOTALS") {
    pick = rawPick;
    if (!["0-1", "2-3", "4+"].includes(pick ?? "")) {
      return { ok: false, error: "Pick a goals range" };
    }
  } else {
    // EXACT
    exactHome = Math.floor(Number(rawExactHome));
    exactAway = Math.floor(Number(rawExactAway));
    if (
      !Number.isFinite(exactHome) ||
      !Number.isFinite(exactAway) ||
      exactHome < 0 ||
      exactAway < 0 ||
      exactHome > 30 ||
      exactAway > 30
    ) {
      return { ok: false, error: "Enter a valid score" };
    }
  }

  return { ok: true, type, pick, exactHome, exactAway };
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
  } else if (type === "BTTS") {
    won = pick === (homeScore > 0 && awayScore > 0 ? "YES" : "NO");
  } else if (type === "TOTALS") {
    won = pick === goalsBand(homeScore + awayScore);
  } else {
    won = exactHome === homeScore && exactAway === awayScore;
  }

  const payout = won ? Math.round(stake * baseMultiplier(type) * bonusMult) : 0;
  return { won, payout };
}

