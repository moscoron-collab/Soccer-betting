import { supabase } from "./supabase";
import { localDate } from "./time";

// "Match of the Day": exactly one per player per local day, fixed for the whole
// day. It's the biggest-league match scheduled on the player's local day (ties
// broken by earliest kickoff). If the player's day has no fixtures, we fall back
// to the soonest upcoming match so something is always highlighted.
//
// Shared by the badge (api/matches) and the bonus (lib/bonus) so they always
// agree. Each player's "day" is computed from their own timezone.

// League ranking, biggest first. Unknown competitions rank last (by kickoff).
// Names match football-data.org's competition.name values.
const LEAGUE_RANK: string[] = [
  "FIFA World Cup",
  "European Championship",
  "UEFA Champions League",
  "UEFA Europa League",
  "Copa Libertadores",
  "Premier League",
  "Primera Division", // La Liga
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Eredivisie",
  "Primeira Liga",
  "Championship",
];

function leagueScore(competition: string): number {
  const i = LEAGUE_RANK.indexOf(competition);
  return i === -1 ? LEAGUE_RANK.length : i; // lower is bigger; unknown = last
}

export type MotdMatch = { id: number; competition: string; kickoff_at: string };

// Pick the Match of the Day from a set of matches, for the given timezone.
export function pickMotd(
  matches: MotdMatch[],
  tz: string | null | undefined,
  now: Date = new Date()
): number | null {
  const today = localDate(tz, now);
  const todays = matches.filter((m) => localDate(tz, new Date(m.kickoff_at)) === today);

  if (todays.length > 0) {
    const best = [...todays].sort((a, b) => {
      const d = leagueScore(a.competition) - leagueScore(b.competition);
      if (d !== 0) return d;
      return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
    });
    return best[0].id;
  }

  // No fixtures on the player's day -> fall back to the soonest upcoming match.
  const upcoming = matches
    .filter((m) => new Date(m.kickoff_at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
  return upcoming[0]?.id ?? null;
}

// Global "featured match" for the Road-to-the-Final event: ONE pick shared by all
// players (unlike the per-player Match of the Day). It's the biggest-league match that
// hasn't kicked off yet (ties broken by soonest kickoff), so everyone can still bet on
// it. Returns null if nothing's upcoming.
export function pickFeaturedGlobal(matches: MotdMatch[], now: Date = new Date()): number | null {
  const upcoming = matches.filter((m) => new Date(m.kickoff_at).getTime() > now.getTime());
  if (upcoming.length === 0) return null;
  const best = [...upcoming].sort((a, b) => {
    const d = leagueScore(a.competition) - leagueScore(b.competition);
    if (d !== 0) return d;
    return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
  });
  return best[0].id;
}

// Server-side: load a small window of matches and pick the MOTD for a timezone.
// Includes already-started/finished matches from today so the pick stays fixed
// for the whole day instead of sliding to the next game.
export async function getMotdId(tz: string | null | undefined): Promise<number | null> {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("matches")
    .select("id, competition, kickoff_at")
    .gte("kickoff_at", since)
    .order("kickoff_at", { ascending: true })
    .limit(200);
  return pickMotd((data ?? []) as MotdMatch[], tz);
}
