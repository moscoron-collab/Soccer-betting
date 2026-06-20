// The "Spin the Wheel" mini-game. Shared by the API (which decides the result)
// and the UI (which draws the same slices and animates to the winning one), so
// there is a single source of truth for the prizes.

export type WheelKind = "COINS" | "BOOST" | "SHIELD" | "JACKPOT";

export type WheelSlice = {
  kind: WheelKind;
  amount: number; // coins for COINS/JACKPOT; number of power-up charges for BOOST/SHIELD
  label: string; // short text shown on the slice
  emoji: string;
  color: string; // slice fill colour (hex)
  weight: number; // relative probability (bigger = more common)
};

// Order matters: this is the clockwise order the slices are drawn in.
export const WHEEL: WheelSlice[] = [
  { kind: "COINS", amount: 50, label: "50", emoji: "🪙", color: "#2563eb", weight: 5 },
  { kind: "BOOST", amount: 1, label: "2× Boost", emoji: "⚡", color: "#f59e0b", weight: 2 },
  { kind: "COINS", amount: 100, label: "100", emoji: "🪙", color: "#3b82f6", weight: 5 },
  { kind: "SHIELD", amount: 1, label: "Shield", emoji: "🛡️", color: "#14b8a6", weight: 2 },
  { kind: "COINS", amount: 75, label: "75", emoji: "🪙", color: "#1d4ed8", weight: 4 },
  { kind: "COINS", amount: 250, label: "250", emoji: "🪙", color: "#60a5fa", weight: 2 },
  { kind: "JACKPOT", amount: 1000, label: "JACKPOT", emoji: "💰", color: "#eab308", weight: 1 },
  { kind: "COINS", amount: 150, label: "150", emoji: "🪙", color: "#1e40af", weight: 3 },
];

// Cost (in coins) of an extra spin once the free daily spin has been used.
export const EXTRA_SPIN_COST = 75;

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
    default:
      return `🪙 +${slice.amount.toLocaleString()} coins`;
  }
}
