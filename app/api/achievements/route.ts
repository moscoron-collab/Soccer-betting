import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, Player } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Stats = { wins: number; exactWin: boolean; bestStreak: number; coins: number; level: number };

const ACHIEVEMENTS: { key: string; emoji: string; label: string; reward: number; check: (s: Stats) => boolean }[] = [
  { key: "first_win", emoji: "🥇", label: "First Win", reward: 100, check: (s) => s.wins >= 1 },
  { key: "wins_10", emoji: "🔟", label: "10 Wins", reward: 500, check: (s) => s.wins >= 10 },
  { key: "wins_50", emoji: "🏆", label: "50 Wins", reward: 2000, check: (s) => s.wins >= 50 },
  { key: "exact_master", emoji: "🎯", label: "Exact Master", reward: 300, check: (s) => s.exactWin },
  { key: "streak_5", emoji: "🔥", label: "5 Win Streak", reward: 300, check: (s) => s.bestStreak >= 5 },
  { key: "coins_5k", emoji: "💰", label: "5,000 Coins", reward: 500, check: (s) => s.coins >= 5000 },
  { key: "coins_25k", emoji: "💎", label: "25,000 Coins", reward: 2000, check: (s) => s.coins >= 25000 },
  { key: "level_10", emoji: "⭐", label: "Reach Level 10", reward: 1000, check: (s) => s.level >= 10 },
];

async function computeStats(player: Player): Promise<Stats> {
  const { data } = await supabase
    .from("predictions")
    .select("status, type, matches(kickoff_at)")
    .eq("player_id", player.id)
    .neq("status", "PENDING");
  const rows = data ?? [];

  const wins = rows.filter((r) => r.status === "WON").length;
  const exactWin = rows.some((r) => r.status === "WON" && r.type === "EXACT");

  const sorted = [...rows].sort(
    (a, b) =>
      new Date((a as any).matches?.kickoff_at ?? 0).getTime() -
      new Date((b as any).matches?.kickoff_at ?? 0).getTime()
  );
  let run = 0;
  let bestStreak = 0;
  for (const r of sorted) {
    if (r.status === "WON") {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else run = 0;
  }

  const level = Math.min(100, Math.floor((player.xp || 0) / 100) + 1);
  return { wins, exactWin, bestStreak, coins: player.coins, level };
}

// GET /api/achievements -> badges with earned/claimed/claimable + reward
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const stats = await computeStats(player);
  const { data: claims } = await supabase
    .from("achievement_claims")
    .select("key")
    .eq("player_id", player.id);
  const claimed = new Set((claims ?? []).map((c) => c.key));

  const list = ACHIEVEMENTS.map((a) => {
    const got = a.check(stats);
    return { key: a.key, emoji: a.emoji, label: a.label, reward: a.reward, got, claimed: claimed.has(a.key), claimable: got && !claimed.has(a.key) };
  });
  return NextResponse.json({ achievements: list });
}

// POST /api/achievements { key } -> claim a unlocked achievement's coins
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const a = ACHIEVEMENTS.find((x) => x.key === body?.key);
  if (!a) return NextResponse.json({ error: "Unknown achievement" }, { status: 400 });

  const stats = await computeStats(player);
  if (!a.check(stats)) return NextResponse.json({ error: "Not unlocked yet." }, { status: 400 });

  const { error: claimErr } = await supabase
    .from("achievement_claims")
    .insert({ player_id: player.id, key: a.key });
  if (claimErr) return NextResponse.json({ error: "Already claimed." }, { status: 409 });

  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: a.reward });
  return NextResponse.json({ reward: a.reward, coins: player.coins + a.reward });
}
