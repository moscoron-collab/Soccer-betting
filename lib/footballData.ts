// Thin client for football-data.org (v4). Free tier: 10 requests/minute.
// Docs: https://docs.football-data.org/general/v4/

const BASE = "https://api.football-data.org/v4";

export type FdMatch = {
  id: number;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoff: string; // ISO
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | string;
  homeScore: number | null;
  awayScore: number | null;
  halfHome: number | null;
  halfAway: number | null;
  stage: string | null; // GROUP_STAGE | LAST_32 | LAST_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL …
  winner: "HOME" | "AWAY" | "DRAW" | null; // overall result incl. extra-time/penalties (knockouts)
};

function getKey(): string {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) throw new Error("Missing FOOTBALL_DATA_KEY env var");
  return key;
}

function trackedCompetitions(): string[] {
  return (process.env.TRACKED_COMPETITIONS ?? "PL,PD,SA,BL1,FL1,CL")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeStatus(s: string): "SCHEDULED" | "IN_PLAY" | "FINISHED" {
  if (s === "FINISHED") return "FINISHED";
  if (s === "IN_PLAY" || s === "PAUSED") return "IN_PLAY";
  return "SCHEDULED";
}

function mapMatch(m: any, fallbackCode = ""): FdMatch {
  return {
    id: m.id,
    competition: m.competition?.name ?? fallbackCode,
    homeTeam: m.homeTeam?.shortName || m.homeTeam?.name || "Home",
    awayTeam: m.awayTeam?.shortName || m.awayTeam?.name || "Away",
    homeCrest: m.homeTeam?.crest ?? null,
    awayCrest: m.awayTeam?.crest ?? null,
    kickoff: m.utcDate,
    status: normalizeStatus(m.status),
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    halfHome: m.score?.halfTime?.home ?? null,
    halfAway: m.score?.halfTime?.away ?? null,
    stage: m.stage ?? null,
    winner: mapWinner(m.score?.winner),
  };
}

// football-data reports the winner as HOME_TEAM | AWAY_TEAM | DRAW (or null while
// unplayed). For knockout games this already accounts for extra time and penalties,
// so it's the source of truth for who advances in the bracket.
function mapWinner(w: any): "HOME" | "AWAY" | "DRAW" | null {
  if (w === "HOME_TEAM") return "HOME";
  if (w === "AWAY_TEAM") return "AWAY";
  if (w === "DRAW") return "DRAW";
  return null;
}

// The football-data competition code for the World Cup (overridable via env).
export function worldCupCode(): string {
  return (process.env.WORLD_CUP_CODE || "WC").trim();
}

// Pull EVERY match of one competition in one request, with NO date window. The
// knockout bracket needs the whole World Cup at once — later rounds (and even some
// of the Round of 32) fall outside the normal "recent + soon" sync window.
export async function fetchCompetitionAll(code: string): Promise<FdMatch[]> {
  const url = `${BASE}/competitions/${code}/matches`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": getKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    // 403/404 = not on this plan / unknown code — skip quietly.
    if (res.status === 403 || res.status === 404) return [];
    throw new Error(`football-data ${code} (all) failed: ${res.status}`);
  }
  const data = await res.json();
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  return matches.map((m: any) => mapMatch(m, code));
}

async function fetchCompetitionMatches(
  code: string,
  dateFrom: string,
  dateTo: string
): Promise<FdMatch[]> {
  const url = `${BASE}/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": getKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    // 403 usually means the competition isn't on your free plan — skip it quietly.
    if (res.status === 403 || res.status === 404) return [];
    throw new Error(`football-data ${code} failed: ${res.status}`);
  }
  const data = await res.json();
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  return matches.map((m: any) => mapMatch(m, code));
}

// One cheap request across ALL competitions for a small date window. Used for
// the fast "settle results while players are online" refresh (1 call, not 6).
export async function fetchRecentResults(daysBack = 2, daysAhead = 1): Promise<FdMatch[]> {
  const from = ymd(new Date(Date.now() - daysBack * 86400000));
  const to = ymd(new Date(Date.now() + daysAhead * 86400000));
  const url = `${BASE}/matches?dateFrom=${from}&dateTo=${to}`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": getKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) return [];
    throw new Error(`football-data /matches failed: ${res.status}`);
  }
  const data = await res.json();
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  return matches.map((m: any) => mapMatch(m));
}

// Pulls matches for all tracked competitions from `daysBack` ago to `daysAhead`
// ahead. Loops one competition at a time with a small delay to respect the
// 10 req/min free-tier limit.
export async function fetchMatches(
  daysBack = 3,
  daysAhead = 10
): Promise<FdMatch[]> {
  const from = new Date(Date.now() - daysBack * 86400000);
  const to = new Date(Date.now() + daysAhead * 86400000);
  const dateFrom = ymd(from);
  const dateTo = ymd(to);

  const out: FdMatch[] = [];
  const comps = trackedCompetitions();
  for (let i = 0; i < comps.length; i++) {
    try {
      const m = await fetchCompetitionMatches(comps[i], dateFrom, dateTo);
      out.push(...m);
    } catch (err) {
      console.error("[footballData]", err);
    }
    // ~7s between calls keeps us comfortably under 10/min even with retries.
    if (i < comps.length - 1) await sleep(7000);
  }
  return out;
}
