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
  left: (BracketMatch | null)[]; // top/left half of the draw (null = empty slot)
  right: (BracketMatch | null)[]; // bottom/right half of the draw
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

// A team isn't decided yet when the feed has no real name — for undetermined
// knockout slots football-data returns blank teams, which our upsert stores as the
// fallback "Home"/"Away". Treat those as empty so the UI shows a clean "TBD".
function isPlaceholderTeam(name: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return n === "" || n === "home" || n === "away" || n === "tbd";
}

function toMatch(row: MatchRow, stage: StageKey): BracketMatch {
  const status = normStatus(row.status);
  const decided = status === "FINISHED";
  const home: BracketTeam | null = isPlaceholderTeam(row.home_team)
    ? null
    : { name: row.home_team, crest: row.home_crest, score: row.home_score, won: decided && row.winner === "HOME" };
  const away: BracketTeam | null = isPlaceholderTeam(row.away_team)
    ? null
    : { name: row.away_team, crest: row.away_crest, score: row.away_score, won: decided && row.winner === "AWAY" };
  return { id: row.id, stage, home, away, status, kickoff: row.kickoff_at };
}

// Stable bracket ordering within a round: by kickoff, then id (so the same match
// always lands in the same slot run-to-run).
function sortMatches(a: MatchRow, b: MatchRow): number {
  const t = new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
  return t !== 0 ? t : a.id - b.id;
}

// ---- Fixed bracket positions ----
// The feed tells us each match's ROUND but not which side/slot of the draw it sits
// in, so we pin the canonical 2026 World Cup bracket here (from the official Round
// of 32 graphic). Index 0..15, top→bottom: slots 0-7 are the left half, 8-15 the
// right half. Because every team maps to its R32 slot, later-round games (whose
// teams are the winners) land in the correct slot automatically — the road to the
// final stays structurally right as results come in.
const R32_ORDER: readonly (readonly [string, string])[] = [
  ["Germany", "Paraguay"], // 0  ┐ left, top
  ["France", "Sweden"], // 1     ┘
  ["South Africa", "Canada"], // 2 ┐
  ["Netherlands", "Morocco"], // 3 ┘
  ["Portugal", "Croatia"], // 4  ┐
  ["Spain", "Austria"], // 5     ┘
  ["USA", "Bosnia and Herzegovina"], // 6 ┐
  ["Belgium", "Senegal"], // 7   ┘  left, bottom
  ["Brazil", "Japan"], // 8      ┐  right, top
  ["Ivory Coast", "Norway"], // 9 ┘
  ["Mexico", "Ecuador"], // 10   ┐
  ["England", "Congo DR"], // 11 ┘
  ["Argentina", "Cape Verde"], // 12 ┐
  ["Australia", "Egypt"], // 13  ┘
  ["Switzerland", "Algeria"], // 14 ┐
  ["Colombia", "Ghana"], // 15   ┘  right, bottom
];

// Tolerant team-name matching: the feed's spelling may differ from ours.
const TEAM_ALIASES: Record<string, string> = {
  "bosnia h": "bosnia and herzegovina",
  "bosnia herzegovina": "bosnia and herzegovina",
  bosnia: "bosnia and herzegovina",
  "united states": "usa",
  "united states of america": "usa",
  us: "usa",
  "dr congo": "congo dr",
  "democratic republic of congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  "congo democratic republic": "congo dr",
  "cote d ivoire": "ivory coast",
  "cote divoire": "ivory coast",
  "cabo verde": "cape verde",
};

function normTeam(name: string): string {
  // NFD splits accents into combining marks; the [^a-z0-9] pass then drops them
  // (and any punctuation/spacing), leaving a clean lowercase token.
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return TEAM_ALIASES[base] ?? base;
}

const TEAM_SLOT = new Map<string, number>();
R32_ORDER.forEach(([a, b], i) => {
  TEAM_SLOT.set(normTeam(a), i);
  TEAM_SLOT.set(normTeam(b), i);
});

// Round depth from the leaves: R32 = 0, R16 = 1, QF = 2, SF = 3. A match's slot in
// its round is its R32 slot divided by 2^depth (standard bracket folding).
const ROUND_DEPTH: Record<string, number> = {
  LAST_32: 0,
  LAST_16: 1,
  QUARTER_FINALS: 2,
  SEMI_FINALS: 3,
  FINAL: 4,
};

// The fixed slot for a match in its round, from whichever of its teams we recognise.
// null when neither team is known yet (an undecided tie) — the caller then fills the
// remaining free slots in order so the tree shape is preserved.
function matchSlot(row: MatchRow, depth: number): number | null {
  for (const name of [row.home_team, row.away_team]) {
    if (isPlaceholderTeam(name)) continue;
    const r32 = TEAM_SLOT.get(normTeam(name));
    if (r32 != null) return Math.floor(r32 / Math.pow(2, depth));
  }
  return null;
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

  // LAST_32 … SEMI_FINALS — drop each match into its fixed slot, then split the
  // full-size round down the middle into the two halves of the draw.
  for (const stage of KO_STAGES) {
    if (stage === "FINAL") continue;
    const size = STAGE_SIZE[stage];
    const depth = ROUND_DEPTH[stage];
    const list = byStage.get(stage) ?? [];
    if (list.length) hasData = true;

    const slots: (BracketMatch | null)[] = new Array(size).fill(null);
    const leftovers: MatchRow[] = [];
    for (const r of [...list].sort(sortMatches)) {
      const s = matchSlot(r, depth);
      if (s != null && s >= 0 && s < size && slots[s] == null) {
        slots[s] = toMatch(r, stage);
      } else {
        leftovers.push(r); // undecided tie or unrecognised team — place after
      }
    }
    let li = 0;
    for (let s = 0; s < size && li < leftovers.length; s++) {
      if (slots[s] == null) slots[s] = toMatch(leftovers[li++], stage);
    }

    const half = size / 2;
    rounds.push({ key: stage, left: slots.slice(0, half), right: slots.slice(half) });
  }

  const finalRows = (byStage.get("FINAL") ?? []).sort(sortMatches);
  const final = finalRows.length ? toMatch(finalRows[0], "FINAL") : null;
  if (final) hasData = true;

  const thirdRows = (byStage.get("THIRD_PLACE") ?? []).sort(sortMatches);
  const thirdPlace = thirdRows.length ? toMatch(thirdRows[0], "THIRD_PLACE") : null;

  return { rounds, final, thirdPlace, hasData };
}
