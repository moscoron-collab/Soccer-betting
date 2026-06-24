import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";
import { getEventConfig, getFeaturedMatchId } from "@/lib/event";
import { getMotdId } from "@/lib/motd";
import { netWorthLeaderboard } from "@/lib/networth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How far back the Hall of Fame (biggest win/loss) looks. Matches the agreed window.
const HALL_OF_FAME_HOURS = 48;

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

  // Featured match (only while the event is on).
  let featured: any = null;
  if (cfg.eventOn) {
    const fid = await getFeaturedMatchId(cfg);
    if (fid) {
      const { data } = await supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, status, home_score, away_score")
        .eq("id", fid)
        .maybeSingle();
      featured = data ?? null;
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
  const toIso = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team, away_team, competition, kickoff_at, status, home_score, away_score")
    .gte("kickoff_at", fromIso)
    .lte("kickoff_at", toIso)
    .order("kickoff_at", { ascending: true })
    .limit(12);

  // Hall of Fame — biggest win & biggest loss in the last 48h (public).
  const since = new Date(Date.now() - HALL_OF_FAME_HOURS * 3_600_000).toISOString();
  const [{ data: winRows }, { data: lossRows }] = await Promise.all([
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
  ]);

  const win = (winRows ?? [])[0];
  const loss = (lossRows ?? [])[0];
  const biggestWin = win
    ? { name: nameOf(win), stake: win.stake, payout: win.payout, team: teamOf(win) }
    : null;
  const biggestLoss = loss
    ? { name: nameOf(loss), amount: loss.stake, team: teamOf(loss) }
    : null;

  // Leaderboard headline (Net Worth) + the viewer's own rank.
  const ranked = await netWorthLeaderboard(1000);
  const top = ranked[0]
    ? { name: ranked[0].username, netWorth: ranked[0].netWorth, avatar: ranked[0].avatar }
    : null;
  const gap = ranked[0] && ranked[1] ? ranked[0].netWorth - ranked[1].netWorth : null;
  const myRank = player ? ranked.findIndex((r) => r.id === player.id) + 1 || null : null;

  return NextResponse.json(
    {
      show: true,
      isAdmin,
      event: {
        on: cfg.eventOn,
        name: cfg.eventName,
        mult: cfg.featuredMult,
        jackpot: cfg.jackpot,
        featured,
      },
      motd,
      matches: matches ?? [],
      hallOfFame: { biggestWin, biggestLoss },
      top,
      gap,
      myRank,
      // Admin-only: the live config so the admin panel can show current values.
      config: isAdmin ? cfg : undefined,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
