// The "Spin the Wheel" mini-game. Shared by the API (which decides the result)
// and the UI (which draws the same slices and animates to the winning one), so
// there is a single source of truth for the prizes.

export type WheelKind = "COINS" | "BOOST" | "SHIELD" | "JACKPOT" | "FREEBET";

export type WheelSlice = {
  kind: WheelKind;
  amount: number; // coins for COINS/JACKPOT; charge/token count for BOOST/SHIELD/FREEBET
  label: string; // short text shown on the slice
  emoji: string;
  color: string; // slice fill colour (hex)
  weight: number; // relative probability (bigger = more common)
};

// The jackpot pays a RANDOM amount in this range (shown on the wheel as "up to 2K").
export const JACKPOT_MIN = 1000;
export const JACKPOT_MAX = 2000;

// Roll an actual jackpot prize (random coins between JACKPOT_MIN and JACKPOT_MAX).
export function rollJackpot(): number {
  return Math.floor(JACKPOT_MIN + Math.random() * (JACKPOT_MAX - JACKPOT_MIN + 1));
}

// Order matters: this is the clockwise order the slices are drawn in.
export const WHEEL: WheelSlice[] = [
  { kind: "COINS", amount: 50, label: "50", emoji: "🪙", color: "#2563eb", weight: 5 },
  { kind: "BOOST", amount: 1, label: "2× Boost", emoji: "⚡", color: "#f59e0b", weight: 2 },
  { kind: "COINS", amount: 25, label: "25", emoji: "🪙", color: "#475569", weight: 5 },
  { kind: "COINS", amount: 100, label: "100", emoji: "🪙", color: "#3b82f6", weight: 4 },
  { kind: "SHIELD", amount: 1, label: "Shield", emoji: "🛡️", color: "#14b8a6", weight: 2 },
  { kind: "FREEBET", amount: 1, label: "Free bet", emoji: "🎟️", color: "#a855f7", weight: 2 },
  { kind: "COINS", amount: 75, label: "75", emoji: "🪙", color: "#1d4ed8", weight: 4 },
  { kind: "COINS", amount: 250, label: "250", emoji: "🪙", color: "#60a5fa", weight: 2 },
  { kind: "JACKPOT", amount: JACKPOT_MAX, label: "up to 2K", emoji: "💰", color: "#eab308", weight: 1 },
  { kind: "COINS", amount: 150, label: "150", emoji: "🪙", color: "#1e40af", weight: 3 },
  { kind: "COINS", amount: 500, label: "500", emoji: "🪙", color: "#1e3a8a", weight: 1 },
  { kind: "COINS", amount: 0, label: "No win", emoji: "😬", color: "#334155", weight: 1 },
];

// The "comeback" wheel — offered only to trailing players (the bottom slice of the
// leaderboard). It's the REGULAR wheel with every coin/jackpot amount DOUBLED, and the
// "No win" slice swapped for a small consolation, so a player near the bottom always
// gets a meaningful boost to climb back in. Same slice order/weights as WHEEL.
export const COMEBACK_WHEEL: WheelSlice[] = [
  { kind: "COINS", amount: 100, label: "100", emoji: "🪙", color: "#2563eb", weight: 5 },
  { kind: "BOOST", amount: 1, label: "2× Boost", emoji: "⚡", color: "#f59e0b", weight: 2 },
  { kind: "COINS", amount: 50, label: "50", emoji: "🪙", color: "#475569", weight: 5 },
  { kind: "COINS", amount: 200, label: "200", emoji: "🪙", color: "#3b82f6", weight: 4 },
  { kind: "SHIELD", amount: 1, label: "Shield", emoji: "🛡️", color: "#14b8a6", weight: 2 },
  { kind: "FREEBET", amount: 1, label: "Free bet", emoji: "🎟️", color: "#a855f7", weight: 2 },
  { kind: "COINS", amount: 150, label: "150", emoji: "🪙", color: "#1d4ed8", weight: 4 },
  { kind: "COINS", amount: 500, label: "500", emoji: "🪙", color: "#60a5fa", weight: 2 },
  { kind: "JACKPOT", amount: JACKPOT_MAX * 2, label: "up to 4K", emoji: "💰", color: "#eab308", weight: 1 },
  { kind: "COINS", amount: 300, label: "300", emoji: "🪙", color: "#1e40af", weight: 3 },
  { kind: "COINS", amount: 1000, label: "1K", emoji: "🪙", color: "#1e3a8a", weight: 1 },
  { kind: "COINS", amount: 100, label: "100", emoji: "🪙", color: "#334155", weight: 1 },
];

// Comeback-wheel access: only the lowest slice of the table, so you must genuinely be
// behind to use it (a top player can't farm it without first throwing away their rank).
export const COMEBACK_BOTTOM_PCT = 0.3; // the bottom 30% by leaderboard rank
export const MIN_PLAYERS_FOR_COMEBACK = 5; // needs a real field for "bottom 30%" to mean anything
export const MAX_COMEBACK_SPINS_PER_DAY = 1; // one free catch-up spin per local day

// Is this player (1-based rank out of `total`) in the comeback-eligible bottom slice?
export function isComebackEligible(rank: number | null | undefined, total: number): boolean {
  if (!rank || total < MIN_PLAYERS_FOR_COMEBACK) return false;
  return rank > total * (1 - COMEBACK_BOTTOM_PCT);
}

// Cost (in coins) of a paid spin once the free daily spin has been used.
export const EXTRA_SPIN_COST = 100;

// Maximum spins allowed per day (1 free + the rest paid).
export const MAX_SPINS_PER_DAY = 4;

// How many spins the player has already used "today" (0 if it's a new day).
// `today` is the player's local date (YYYY-MM-DD) computed from their timezone.
export function spinsUsedToday(spinDay: string | null, spinsToday: number, today: string): number {
  return spinDay === today ? spinsToday : 0;
}

// Picks a winning slice index, weighted by each slice's `weight`. Defaults to the
// regular wheel; pass COMEBACK_WHEEL (or any wheel) to roll on a different prize set.
export function pickSliceIndex(wheel: WheelSlice[] = WHEEL): number {
  const total = wheel.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < wheel.length; i++) {
    r -= wheel[i].weight;
    if (r < 0) return i;
  }
  return wheel.length - 1;
}

// A friendly one-line summary of a prize (for toasts/celebrations).
export function describePrize(slice: WheelSlice): string {
  switch (slice.kind) {
    case "BOOST":
      return `⚡ ${slice.amount} × 2× payout power-up!`;
    case "SHIELD":
      return `🛡️ ${slice.amount} × streak shield!`;
    case "JACKPOT":
      return `💰 JACKPOT! +🪙${slice.amount.toLocaleString()}`;
    case "FREEBET":
      return `🎟️ ${slice.amount} × free bet token!`;
    default:
      return slice.amount === 0
        ? "😬 No win this time — try another spin!"
        : `🪙 +${slice.amount.toLocaleString()} coins`;
  }
}

// Did the spin actually win something? Everything is a prize EXCEPT the 0-coin
// "No win" slice — so the UI knows when NOT to celebrate (no confetti/cheer).
export function isWinningSlice(slice: WheelSlice): boolean {
  return !(slice.kind === "COINS" && slice.amount === 0);
}

// Celebration tier for a win, so big wins sound more special than small ones:
//   "jackpot" — the 💰 jackpot (the biggest moment)
//   "big"     — a large coin prize (250 or 500)
//   null      — an ordinary win (normal cheer only, no extra fanfare)
export function bigWinTier(slice: WheelSlice): "jackpot" | "big" | null {
  if (slice.kind === "JACKPOT") return "jackpot";
  if (slice.kind === "COINS" && slice.amount >= 250) return "big";
  return null;
}
