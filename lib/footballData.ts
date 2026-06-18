// Thin client for football-data.org (v4). Free tier: 10 requests/minute.
// Docs: https://docs.football-data.org/general/v4/

const BASE = "https://api.football-data.org/v4";

export type FdMatch = {
  id: number;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string; // ISO
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | string;
  homeScore: number | null;
  awayScore: number | null;
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
  return matches.map((m: any): FdMatch => ({
    id: m.id,
    competition: m.competition?.name ?? code,
    homeTeam: m.homeTeam?.shortName || m.homeTeam?.name || "Home",
    awayTeam: m.awayTeam?.shortName || m.awayTeam?.name || "Away",
    kickoff: m.utcDate,
    status: normalizeStatus(m.status),
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
  }));
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
