// "Road to the Final" — turns the raw World Cup knockout matches (mirrored from
// football-data into our `matches` table) into a structured bracket the UI can draw.
//
// It is a LIVE, READ-ONLY view of the real tournament: every team, score and
// status comes straight from the feed. We never guess who advances — the feed
// itself fills the next round once FIFA sets the fixtures, so empty slots simply
// render as "to be decided" until then.

// The knockout rounds in order, leaves (Round of 32) first → Final last. These are
// football-data's v4 stage codes for the 48-team 2026 World Cup.
export const KO_STAGES = [
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "FINAL",
] as const;
export type StageKey = (typeof KO_STAGES)[number] | "THIRD_PLACE";

// Map the feed's stage string to our canonical round key. Tolerant of the common
// naming variants so a slightly different label can't make a whole round vanish.
// Anything not a knockout round (e.g. GROUP_STAGE) maps to null and is ignored.
const STAGE_ALIASES: Record<string, StageKey> = {
  LAST_32: "LAST_32",
  ROUND_OF_32: "LAST_32",
  LAST_16: "LAST_16",
  ROUND_OF_16: "LAST_16",
  QUARTER_FINALS: "QUARTER_FINALS",
  QUARTER_FINAL: "QUARTER_FINALS",
  SEMI_FINALS: "SEMI_FINALS",
  SEMI_FINAL: "SEMI_FINALS",
  THIRD_PLACE: "THIRD_PLACE",
  THIRD_PLACE_FINAL: "THIRD_PLACE",
  THIRD_PLACE_PLAY_OFF: "THIRD_PLACE",
  FINAL: "FINAL",
};

export function normStage(raw: string | null): StageKey | null {
  if (!raw) return null;
  return STAGE_ALIASES[raw.trim().toUpperCase()] ?? null;
}

// How many matches a complete round has — used to lay the bracket out symmetrically
// even while later rounds are still empty.
export const STAGE_SIZE: Record<string, number> = {
  LAST_32: 16,
  LAST_16: 8,
  QUARTER_FINALS: 4,
  SEMI_FINALS: 2,
  FINAL: 1,
  THIRD_PLACE: 1,
};

// A row as it comes out of the `matches` table (only the columns we need).
export type MatchRow = {
  id: number;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  stage: string | null;
  winner: string | null; // HOME | AWAY | DRAW | null
  kickoff_at: string;
};

export type BracketTeam = {
  name: string;
  crest: string | null;
  score: number | null;
  won: boolean; // true once this side has advanced (winner of a finished match)
};

export type BracketMatch = {
  id: number;
  stage: StageKey;
  home: BracketTeam | null;
  away: BracketTeam | null;
  status: "SCHEDULED" | "IN_PLAY" | "FINISHED";
  kickoff: string;
};

export type BracketRound = {
  key: StageKey;
  left: BracketMatch[]; // top/left half of the draw
  right: BracketMatch[]; // bottom/right half of the draw
};

export type Bracket = {
  rounds: BracketRound[]; // LAST_32 … SEMI_FINALS, each split into two halves
  final: BracketMatch | null;
  thirdPlace: BracketMatch | null;
  hasData: boolean; // false → nothing in the feed yet (show the empty state)
};

function normStatus(s: string): "SCHEDULED" | "IN_PLAY" | "FINISHED" {
  if (s === "FINISHED") return "FINISHED";
  if (s === "IN_PLAY" || s === "PAUSED") return "IN_PLAY";
  return "SCHEDULED";
}

function toMatch(row: MatchRow, stage: StageKey): BracketMatch {
  const status = normStatus(row.status);
  const decided = status === "FINISHED";
  const home: BracketTeam = {
    name: row.home_team,
    crest: row.home_crest,
    score: row.home_score,
    won: decided && row.winner === "HOME",
  };
  const away: BracketTeam = {
    name: row.away_team,
    crest: row.away_crest,
    score: row.away_score,
    won: decided && row.winner === "AWAY",
  };
  return { id: row.id, stage, home, away, status, kickoff: row.kickoff_at };
}

// Stable bracket ordering within a round: by kickoff, then id (so the same match
// always lands in the same slot run-to-run).
function sortMatches(a: MatchRow, b: MatchRow): number {
  const t = new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
  return t !== 0 ? t : a.id - b.id;
}

// Build the whole bracket from the World Cup knockout rows.
export function buildBracket(rows: MatchRow[]): Bracket {
  const byStage = new Map<StageKey, MatchRow[]>();
  for (const r of rows) {
    const stage = normStage(r.stage);
    if (!stage) continue;
    const list = byStage.get(stage) ?? [];
    list.push(r);
    byStage.set(stage, list);
  }

  const rounds: BracketRound[] = [];
  let hasData = false;

  // LAST_32 … SEMI_FINALS — each split down the middle into the two halves of the
  // draw so the bracket can fan out symmetrically toward the centre Final.
  for (const stage of KO_STAGES) {
    if (stage === "FINAL") continue;
    const list = (byStage.get(stage) ?? []).sort(sortMatches).map((r) => toMatch(r, stage));
    if (list.length) hasData = true;
    const half = Math.ceil(list.length / 2);
    rounds.push({ key: stage, left: list.slice(0, half), right: list.slice(half) });
  }

  const finalRows = (byStage.get("FINAL") ?? []).sort(sortMatches);
  const final = finalRows.length ? toMatch(finalRows[0], "FINAL") : null;
  if (final) hasData = true;

  const thirdRows = (byStage.get("THIRD_PLACE") ?? []).sort(sortMatches);
  const thirdPlace = thirdRows.length ? toMatch(thirdRows[0], "THIRD_PLACE") : null;

  return { rounds, final, thirdPlace, hasData };
}
