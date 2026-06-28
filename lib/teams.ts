// "To be decided" (TBD) fixtures.
//
// football-data.org leaves a knockout fixture's teams null until the bracket
// resolves (e.g. "winner of match 49"). lib/footballData.ts stores those empty
// slots as the placeholder strings "Home" / "Away". A match with either side
// still a placeholder is TBD: we show it in the schedule but DON'T open it for
// betting until both real teams are known. Once football-data fills the team in,
// the next sync overwrites the placeholder and the match becomes bettable.
//
// A real away team is never literally "Home" and a real home team is never
// "Away", so matching these exact strings is safe.

export const TBD_HOME = "Home";
export const TBD_AWAY = "Away";

// True if a stored team name is a not-yet-decided placeholder (covers the
// "Home"/"Away" sentinels, an explicit "TBD", and any empty value).
export function isPlaceholderTeam(name: string | null | undefined): boolean {
  return !name || name === TBD_HOME || name === TBD_AWAY || name === "TBD";
}

// True if EITHER side of the match is still undecided.
export function isMatchTbd(
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined
): boolean {
  return isPlaceholderTeam(homeTeam) || isPlaceholderTeam(awayTeam);
}
