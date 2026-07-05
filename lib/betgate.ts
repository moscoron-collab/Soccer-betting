// "Spin before you bet" gate. The regular wheel now has risk slices (lose 10% / 15%),
// so players could dodge that risk by never spinning and just betting. To stop that,
// a regular-wheel player must take their daily spin before placing any bet.
//
// The gate is ONLY on the regular wheel: comeback-group players (bottom of the table)
// and admins are exempt. Enforced server-side so it can't be bypassed from the client.

import type { Player } from "./auth";
import { spinsUsedToday } from "./wheel";
import { comebackStatus, comebackAccess } from "./comeback";
import { getEventConfig } from "./event";

// True when this player still owes their daily regular-wheel spin before they can bet.
export async function needsSpinBeforeBet(player: Player, today: string): Promise<boolean> {
  if (player.is_admin === true) return false; // admins bet freely (they can preview wheels)

  // Only regular-wheel players are gated. Work out which wheel this player is on the
  // same way /api/me does (net-worth rank + whether the comeback wheel is live).
  const { eligible: bottomSlice } = await comebackStatus(player.id);
  const { comebackLive } = await getEventConfig();
  const { showRegular } = comebackAccess(false, bottomSlice, comebackLive);
  if (!showRegular) return false; // comeback-group player — not gated

  return spinsUsedToday(player.spin_day, player.spins_today, today) === 0;
}
