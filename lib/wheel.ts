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
  { kind: "COINS", amount: 0, label: "No win", emoji: "😬", color: "#334155", weight: 3 },
];

// Cost (in coins) of a paid spin once the free daily spin has been used.
export const EXTRA_SPIN_COST = 100;

// Maximum spins allowed per day (1 free + the rest paid).
export const MAX_SPINS_PER_DAY = 4;

// How many spins the player has already used "today" (0 if it's a new day).
// `today` is the player's local date (YYYY-MM-DD) computed from their timezone.
export function spinsUsedToday(spinDay: string | null, spinsToday: number, today: string): number {
  return spinDay === today ? spinsToday : 0;
}

// Picks a winning slice index, weighted by each slice's `weight`.
export function pickSliceIndex(): number {
  const total = WHEEL.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL.length; i++) {
    r -= WHEEL[i].weight;
    if (r < 0) return i;
  }
  return WHEEL.length - 1;
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
