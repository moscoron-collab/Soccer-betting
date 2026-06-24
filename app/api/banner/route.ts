import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { getEventConfig, getFeaturedMatchIds } from "@/lib/event";
import { getMotdId } from "@/lib/motd";
import { netWorthLeaderboard, RankedPlayer } from "@/lib/networth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How far back the Hall of Fame (biggest win/loss) looks. Matches the agreed window.
// The social lines (win rate, biggest mover, new players) share this same window.
const HALL_OF_FAME_HOURS = 48;

// Minimum settled bets in the window to qualify for the "best win rate" line, so a
// lone 1-for-1 doesn't get crowned at 100%.
const MIN_RATED_BETS = 4;
// A net coin swing must be at least this big to earn a "biggest mover" shout-out.
const MOVER_MIN = 300;
// Tightest adjacent net-worth gap near the top that counts as a "rivalry".
const RIVALRY_MAX_GAP = 1000;

// Pull the username/team out of a joined prediction row (Supabase returns the
// to-one relations as nested objects; type them loosely).
function nameOf(row: any): string | null {
  return row?.players?.username ?? null;
}
// The team the bet was actually backing (for "... on England"), else the fixture.
function teamOf(row: any): string | null {
  const m = row?.matches;
  if (!m) return null;
  if (row.type === "WINNER" || row.type === "HALFTIME") {
    if (row.pick === "HOME") return m.home_team;
    if (row.pick === "AWAY") return m.away_team;
  }
  return `${m.home_team} v ${m.away_team}`;
}

// Biggest rank climber since the last snapshot. Compares current ranks to a stored
// snapshot in app_meta and refreshes that snapshot when it's older than 12h, so the
// line reflects "biggest jump in roughly the last few hours".
async function biggestClimber(ranked: { id: string; username: string }[]) {
  try {
    const { data } = await supabase.from("app_meta").select("value").eq("key", "rank_snapshot").maybeSingle();
    let snap: any = null;
    try {
      snap = (data as any)?.value ? JSON.parse((data as any).value) : null;
    } catch {
      /* corrupt snapshot — treat as none */
    }
    const currentRanks: Record<string, number> = {};
    ranked.forEach((r, i) => (currentRanks[r.id] = i + 1));

    let best: { name: string; from: number; to: number; jump: number } | null = null;
    if (snap?.ranks) {
      for (const r of ranked) {
        const to = currentRanks[r.id];
        const from = snap.ranks[r.id];
        if (from && from > to) {
          const jump = from - to;
          if (!best || jump > best.jump) best = { name: r.username, from, to, jump };
        }
      }
    }

    const nowMs = Date.now();
    const stale = !snap?.ts || nowMs - new Date(snap.ts).getTime() > 12 * 3_600_000;
    if (stale) {
      const iso = new Date(nowMs).toISOString();
      await supabase
        .from("app_meta")
        .upsert({ key: "rank_snapshot", value: JSON.stringify({ ts: iso, ranks: currentRanks }), updated_at: iso }, { onConflict: "key" });
    }
    return best;
  } catch {
    return null;
  }
}

// Recent form over the `since` window, in one pass over settled predictions:
//   • bestWinRate — the sharpest predictor (win rate, min sample), tie-break by volume.
//   • mover — the biggest coin gainer and (separately) the biggest faller, by net of
//     settled bets. Coin math mirrors settlement: a win returns `payout` (stake was
//     already deducted, so profit = payout − stake), a loss costs the stake. Free bets
//     risk no coins, so a free win is pure profit and a free loss costs nothing.
async function playerForm(since: string) {
  const { data } = await supabase
    .from("predictions")
    .select("player_id, status, stake, payout, free_bet, players(username)")
    .in("status", ["WON", "LOST"])
    .gte("settled_at", since);

  const agg = new Map<string, { name: string; won: number; total: number; net: number }>();
  for (const r of (data ?? []) as any[]) {
    const name = r.players?.username;
    if (!name) continue;
    const e = agg.get(r.player_id) ?? { name, won: 0, total: 0, net: 0 };
    e.total++;
    if (r.status === "WON") {
      e.won++;
      e.net += r.free_bet ? (r.payout ?? 0) : (r.payout ?? 0) - (r.stake ?? 0);
    } else if (!r.free_bet) {
      e.net -= r.stake ?? 0;
    }
    agg.set(r.player_id, e);
  }
  const entries = [...agg.values()];

  const rated = entries
    .filter((e) => e.total >= MIN_RATED_BETS)
    .sort((a, b) => b.won / b.total - a.won / a.total || b.total - a.total || b.net - a.net);
  const r0 = rated[0];
  const bestWinRate = r0
    ? { name: r0.name, pct: Math.round((r0.won / r0.total) * 100), won: r0.won, total: r0.total }
    : null;

  const byNet = [...entries].sort((a, b) => b.net - a.net);
  const up = byNet[0];
  const down = byNet[byNet.length - 1];
  const gainer = up && up.net >= MOVER_MIN ? { name: up.name, amount: Math.round(up.net) } : null;
  const faller = down && down.net <= -MOVER_MIN ? { name: down.name, amount: Math.round(-down.net) } : null;

  return { bestWinRate, mover: { gainer, faller } };
}

// The tightest race near the top: the smallest positive net-worth gap between adjacent
// players in the top 8, if it's within RIVALRY_MAX_GAP. `rank` is the spot being chased.
function findRivalry(ranked: RankedPlayer[]) {
  let best: { leader: string; chaser: string; gap: number; rank: number } | null = null;
  const top = ranked.slice(0, 8);
  for (let i = 0; i + 1 < top.length; i++) {
    const gap = top[i].netWorth - top[i + 1].netWorth;
    if (gap > 0 && gap <= RIVALRY_MAX_GAP && (!best || gap < best.gap)) {
      best = { leader: top[i].username, chaser: top[i + 1].username, gap, rank: i + 1 };
    }
  }
  return best;
}

// GET /api/banner -> everything the scrolling marquee needs (world + event + records).
// Personal "you" lines come from /api/me; this endpoint is the shared/world view.
// Gating: non-admins only get data when the banner is public; admins always do, so
// they can preview it live before flipping it on for everyone.
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  const isAdmin = player?.is_admin === true;

  const cfg = await getEventConfig();
  if (!cfg.bannerPublic && !isAdmin) {
    return NextResponse.json(
      { show: false },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }

  // Featured match(es) (only while the event is on) — admin can feature several.
  let featuredMatches: any[] = [];
  if (cfg.eventOn) {
    const fids = await getFeaturedMatchIds(cfg);
    if (fids.length) {
      const { data } = await supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, status, home_score, away_score")
        .in("id", fids);
      featuredMatches = data ?? [];
    }
  }

  // Match of the Day for this player (per their local day; the ⭐ bonus game).
  let motd: any = null;
  const tz = new URL(req.url).searchParams.get("tz");
  const motdId = await getMotdId(tz);
  if (motdId) {
    const { data } = await supabase
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, status, home_score, away_score")
      .eq("id", motdId)
      .maybeSingle();
    motd = data ?? null;
  }

  // Live + upcoming (and just-finished) matches for the live lines.
  const fromIso = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const toIso = new Date(Date.now() + 18 * 3_600_000).toISOString(); // only 18h ahead
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team, away_team, competition, kickoff_at, status, home_score, away_score")
    .gte("kickoff_at", fromIso)
    .lte("kickoff_at", toIso)
    .order("kickoff_at", { ascending: true })
    .limit(12);

  // Hall of Fame — biggest win & biggest loss in the last 48h (public).
  const since = new Date(Date.now() - HALL_OF_FAME_HOURS * 3_600_000).toISOString();
  const [{ data: winRows }, { data: lossRows }, { data: betRows }] = await Promise.all([
    supabase
      .from("predictions")
      .select("stake, payout, pick, type, players(username), matches(home_team, away_team)")
      .eq("status", "WON")
      .gte("settled_at", since)
      .order("payout", { ascending: false })
      .limit(1),
    supabase
      .from("predictions")
      .select("stake, pick, type, players(username), matches(home_team, away_team)")
      .eq("status", "LOST")
      .eq("free_bet", false)
      .gte("settled_at", since)
      .order("stake", { ascending: false })
      .limit(1),
    supabase
      .from("predictions")
      .select("stake, pick, type, players(username), matches(home_team, away_team)")
      .eq("free_bet", false)
      .gte("created_at", since)
      .order("stake", { ascending: false })
      .limit(1),
  ]);

  const win = (winRows ?? [])[0];
  const loss = (lossRows ?? [])[0];
  const bet = (betRows ?? [])[0];
  const biggestWin = win
    ? { name: nameOf(win), stake: win.stake, payout: win.payout, team: teamOf(win) }
    : null;
  const biggestLoss = loss
    ? { name: nameOf(loss), amount: loss.stake, team: teamOf(loss) }
    : null;
  const biggestBet = bet ? { name: nameOf(bet), amount: bet.stake, team: teamOf(bet) } : null;

  // Leaderboard headline (Net Worth) + the viewer's own rank.
  const ranked = await netWorthLeaderboard(1000);
  const top = ranked[0]
    ? { name: ranked[0].username, netWorth: ranked[0].netWorth, avatar: ranked[0].avatar }
    : null;
  const top3 = ranked.slice(0, 3).map((r) => ({ name: r.username, netWorth: r.netWorth }));
  const gap = ranked[0] && ranked[1] ? ranked[0].netWorth - ranked[1].netWorth : null;
  const climber = await biggestClimber(ranked);
  const myRank = player ? ranked.findIndex((r) => r.id === player.id) + 1 || null : null;

  // Social lines: tightest table race, freshly-joined players (within the window),
  // and recent form (best win rate + biggest coin movers).
  const rivalry = findRivalry(ranked);
  const newcomers = ranked
    .filter((r) => r.created_at && r.created_at >= since)
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1))
    .slice(0, 2)
    .map((r) => ({ name: r.username }));
  const form = await playerForm(since);

  // Admin-only: a list of upcoming matches (next ~4 days) so the admin panel can
  // offer a "pick the featured match" dropdown instead of a raw match id.
  let adminMatches: any[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("matches")
      .select("id, home_team, away_team, kickoff_at")
      .gte("kickoff_at", new Date(Date.now() - 3 * 3_600_000).toISOString())
      .lte("kickoff_at", new Date(Date.now() + 4 * 86_400_000).toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(60);
    adminMatches = data ?? [];
  }

  return NextResponse.json(
    {
      show: true,
      isAdmin,
      event: {
        on: cfg.eventOn,
        name: cfg.eventName,
        mult: cfg.featuredMult,
        jackpot: cfg.jackpot,
        featuredMatches,
      },
      motd,
      matches: matches ?? [],
      hallOfFame: { biggestWin, biggestLoss, biggestBet },
      top,
      top3,
      climber,
      gap,
      myRank,
      rivalry,
      newcomers,
      bestWinRate: form.bestWinRate,
      mover: form.mover,
      // Admin-only: the live config + upcoming matches for the admin panel.
      config: isAdmin ? cfg : undefined,
      adminMatches,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
