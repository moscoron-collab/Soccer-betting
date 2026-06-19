"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { celebrate, toast } from "@/lib/celebrate";
import { VERSION, CHANGELOG } from "@/lib/changelog";

const TOKEN_KEY = "spg_token";

type Player = { id: string; username: string; coins: number; xp: number; win_streak: number };
type BetType = "WINNER" | "EXACT" | "HALFTIME" | "GOALS3" | "BTTS" | "TOTALS";
type Match = {
  id: number;
  competition: string;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  kickoff_at: string;
  bet_stats?: {
    home: number;
    draw: number;
    away: number;
    voters: { username: string; pick: string }[];
  };
};
type Prediction = {
  id: string;
  type: BetType;
  pick: string | null;
  exact_home: number | null;
  exact_away: number | null;
  stake: number;
  payout: number;
  bonus_mult: number;
  status: "PENDING" | "WON" | "LOST";
  matches: {
    home_team: string;
    away_team: string;
    competition: string;
    kickoff_at: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    half_home: number | null;
    half_away: number | null;
    home_crest: string | null;
    away_crest: string | null;
  } | null;
};

const BET_LABELS: Record<BetType, string> = {
  WINNER: "Winner / Draw",
  EXACT: "Exact score",
  HALFTIME: "Half-time leader",
  GOALS3: "3+ goals",
  BTTS: "Both teams score",
  TOTALS: "Total goals",
};
const BASE_MULT: Record<BetType, number> = {
  WINNER: 2,
  EXACT: 5,
  HALFTIME: 2,
  GOALS3: 2,
  BTTS: 2,
  TOTALS: 3,
};
// A plain-English question shown above each market's options.
const BET_PROMPTS: Record<BetType, string> = {
  WINNER: "Who wins the match?",
  EXACT: "Guess the exact final score",
  HALFTIME: "Who's leading at half-time?",
  GOALS3: "Will there be 3 or more goals?",
  BTTS: "Will both teams score?",
  TOTALS: "How many goals in total (both teams)?",
};

// Coins a pending bet would return if it wins (base × locked-in bonus).
function potentialWin(p: Prediction): number {
  return Math.round(p.stake * BASE_MULT[p.type] * (p.bonus_mult ?? 1));
}

// The effective multiplier shown to players (base × bonus), so stake × this = could-win.
function effMult(p: Prediction): string {
  const m = BASE_MULT[p.type] * (p.bonus_mult ?? 1);
  const s = Number.isInteger(m) ? `${m}` : m.toFixed(1);
  return (p.bonus_mult ?? 1) > 1 ? `×${s} 🔥` : `×${s}`;
}

// Level/tier from XP (100 XP per level, tiers match the original concept).
function levelInfo(xp: number) {
  const level = Math.min(100, Math.floor((xp || 0) / 100) + 1);
  const tier =
    level >= 100 ? "Legend" : level >= 50 ? "Expert" : level >= 25 ? "Scout" : level >= 10 ? "Analyst" : "Rookie";
  return { level, tier, intoLevel: (xp || 0) % 100 };
}

type LeaderRow = { username: string; coins: number };

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", "x-player-token": token };
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [canBailout, setCanBailout] = useState(false);
  const [canSpin, setCanSpin] = useState(false);
  const [canPenalty, setCanPenalty] = useState(false);
  const seenWon = useRef<Set<string> | null>(null);

  // Load token from storage on first render.
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    setToken(t);
    setReady(true);
  }, []);

  const loadMe = useCallback(async (t: string) => {
    const res = await fetch("/api/me", { headers: authHeaders(t) });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setPlayer(null);
      return;
    }
    const data = await res.json();
    const preds: Prediction[] = data.predictions ?? [];

    // Celebrate bets that have just been won since the last check.
    const wonIds = new Set(preds.filter((p) => p.status === "WON").map((p) => p.id));
    if (seenWon.current === null) {
      seenWon.current = wonIds; // first load — don't celebrate past wins
    } else {
      const fresh = preds.filter((p) => p.status === "WON" && !seenWon.current!.has(p.id));
      if (fresh.length > 0) {
        const gained = fresh.reduce((s, p) => s + p.payout, 0);
        celebrate(`🎉 You won 🪙${gained.toLocaleString()}!`);
      }
      seenWon.current = wonIds;
    }

    setPlayer(data.player);
    setPredictions(preds);
    setCanBailout(!!data.canBailout);
    setCanSpin(!!data.canSpin);
    setCanPenalty(!!data.canPenalty);
  }, []);

  useEffect(() => {
    if (token) loadMe(token);
  }, [token, loadMe]);

  // Poll every 60s so wins pop while you're watching.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => loadMe(token), 60000);
    return () => clearInterval(id);
  }, [token, loadMe]);

  function onSignedIn(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPlayer(null);
    setPredictions([]);
  }

  if (!ready) return null;

  return (
    <>
      <Toaster />
      {!token || !player ? (
        <AuthScreen onSignedIn={onSignedIn} />
      ) : (
        <Game
          token={token}
          player={player}
          predictions={predictions}
          canBailout={canBailout}
          canSpin={canSpin}
          canPenalty={canPenalty}
          onRefresh={() => loadMe(token)}
          onSignOut={signOut}
        />
      )}
    </>
  );
}

/* ------------------------------- Toaster ---------------------------------- */

function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    function onToast(e: Event) {
      const msg = (e as CustomEvent).detail as string;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, msg }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    }
    window.addEventListener("spg-toast", onToast);
    return () => window.removeEventListener("spg-toast", onToast);
  }, []);

  return (
    <div className="fixed left-1/2 top-4 z-[10000] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// Animated number that counts up/down when its value changes.
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setDisplay(Math.round(from + (to - from) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

/* ------------------------------- Auth screen ------------------------------- */

function AuthScreen({ onSignedIn }: { onSignedIn: (t: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === "signup" ? "/api/players" : "/api/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onSignedIn(data.token);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = username.trim().length >= 2 && password.length >= 4;

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <h1 className="text-3xl font-extrabold text-center">⚽ Soccer Predictor</h1>
      <p className="mt-2 text-center text-blue-100/80">
        Predict real matches. Win coins. Top the leaderboard.
      </p>

      <div className="mt-8 rounded-2xl bg-white/5 p-5 shadow-lg backdrop-blur">
        <div className="mb-4 flex gap-2 rounded-xl bg-white/5 p-1">
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === "login" ? "bg-blue-600 text-white" : "text-blue-100"}`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Log in
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-blue-600 text-white" : "text-blue-100"}`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            New player
          </button>
        </div>

        <label className="text-sm font-medium">Username</label>
        <input
          className="mt-1 w-full rounded-lg bg-white/95 px-3 py-2 text-gray-900 outline-none"
          value={username}
          maxLength={20}
          placeholder="e.g. GoalMachine"
          autoCapitalize="none"
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="mt-3 block text-sm font-medium">Password</label>
        <input
          type="password"
          className="mt-1 w-full rounded-lg bg-white/95 px-3 py-2 text-gray-900 outline-none"
          value={password}
          maxLength={50}
          placeholder={mode === "signup" ? "choose a password" : "your password"}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
        />

        <button
          disabled={busy || !canSubmit}
          onClick={submit}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "…"
            : mode === "signup"
              ? "Start playing (1,000 coins)"
              : "Log in"}
        </button>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <p className="mt-3 text-center text-xs text-blue-100/60">
          {mode === "login"
            ? "New here? Tap “New player” above to create an account."
            : "Pick any username + password. Use the same ones to log in on your phone."}
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-blue-100/60">
        Free to play • Virtual coins only • No real money
      </p>
    </main>
  );
}

/* --------------------------------- Game ----------------------------------- */

function Game({
  token,
  player,
  predictions,
  canBailout,
  canSpin,
  canPenalty,
  onRefresh,
  onSignOut,
}: {
  token: string;
  player: Player;
  predictions: Prediction[];
  canBailout: boolean;
  canSpin: boolean;
  canPenalty: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [comp, setComp] = useState("All");
  const [visible, setVisible] = useState(10);
  const [view, setView] = useState<"play" | "log">("play");
  const [showChanges, setShowChanges] = useState(false);
  const [seenVersion, setSeenVersion] = useState<string>(VERSION);

  useEffect(() => {
    setSeenVersion(localStorage.getItem("spg_seen_version") ?? "");
  }, []);
  const hasUpdate = seenVersion !== VERSION;

  function openChanges() {
    setShowChanges(true);
    localStorage.setItem("spg_seen_version", VERSION);
    setSeenVersion(VERSION);
  }

  const loadMatches = useCallback(async () => {
    const res = await fetch("/api/matches");
    const data = await res.json();
    setMatches(data.matches ?? []);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    setLeaderboard(data.leaderboard ?? []);
  }, []);

  useEffect(() => {
    loadMatches();
    loadLeaderboard();
  }, [loadMatches, loadLeaderboard]);

  async function share() {
    const url =
      process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL !== "http://localhost:3000"
        ? process.env.NEXT_PUBLIC_SITE_URL
        : window.location.origin;
    const text = "Play the Soccer Prediction Game with me! ⚽";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Soccer Predictor", text, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    alert("Link copied! Send it to your friends.");
  }

  async function bailout() {
    await fetch("/api/me", { method: "POST", headers: authHeaders(token) });
    onRefresh();
  }

  // Map of matchId -> the player's bets on that match (up to one of each type).
  const predByMatch = new Map<number, Prediction[]>();
  for (const p of predictions) {
    const mid = (p as any).match_id as number;
    const arr = predByMatch.get(mid) ?? [];
    arr.push(p);
    predByMatch.set(mid, arr);
  }

  // Competition filter + "show more" to keep the match list short.
  const competitions = Array.from(new Set(matches.map((m) => m.competition)));
  const filtered = comp === "All" ? matches : matches.filter((m) => m.competition === comp);
  const shown = filtered.slice(0, visible);

  // Match of the Day = soonest upcoming match (list arrives sorted by kickoff).
  const motdId = matches[0]?.id;

  // Pending bets grouped by match (one card per match) for "My predictions".
  const pendingByMatch = new Map<number, Prediction[]>();
  for (const p of predictions) {
    if (p.status !== "PENDING") continue;
    const mid = (p as any).match_id as number;
    const arr = pendingByMatch.get(mid) ?? [];
    arr.push(p);
    pendingByMatch.set(mid, arr);
  }
  const pendingGroups = Array.from(pendingByMatch.values());

  function pickComp(c: string) {
    setComp(c);
    setVisible(10);
  }

  async function spin() {
    const res = await fetch("/api/spin", { method: "POST", headers: authHeaders(token) });
    const data = await res.json();
    if (res.ok) {
      celebrate(`🎰 Daily Spin: +🪙${data.reward}!`);
      onRefresh();
    } else {
      toast(data.error ?? "Try again.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-blue-100/70">Playing as</p>
          <h1 className="text-xl font-bold">{player.username}</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-blue-100/70">Coins</p>
          <p className="text-2xl font-extrabold text-yellow-300">
            🪙 <CountUp value={player.coins} />
          </p>
          <button
            onClick={openChanges}
            className="mt-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-blue-100"
          >
            v{VERSION} · What&apos;s new
            {hasUpdate && (
              <span className="ml-1 rounded-full bg-yellow-400 px-1 text-[10px] font-bold text-gray-900">
                !
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={share} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold">
          🔗 Invite a friend
        </button>
        <button onClick={onSignOut} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
          Sign out
        </button>
      </div>

      {canBailout && (
        <div className="mt-4 rounded-xl bg-yellow-500/20 p-4">
          <p className="text-sm">You're low on coins! Grab a free daily top-up.</p>
          <button
            onClick={bailout}
            className="mt-2 rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-900"
          >
            Get 100 coins
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-2 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => setView("play")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${view === "play" ? "bg-blue-600 text-white" : "text-blue-100"}`}
        >
          🎮 Play
        </button>
        <button
          onClick={() => setView("log")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${view === "log" ? "bg-blue-600 text-white" : "text-blue-100"}`}
        >
          📊 My Log
        </button>
      </div>

      {view === "log" && (
        <MyLog predictions={predictions} player={player} token={token} onChange={onRefresh} />
      )}

      {view === "play" && (
        <>
      {/* Leaderboard */}
      <Section title="🏆 Leaderboard">
        <div className="overflow-hidden rounded-xl bg-white/5">
          {leaderboard.map((row, i) => (
            <div
              key={row.username + i}
              className={`flex items-center justify-between px-4 py-2 text-sm ${row.username === player.username ? "bg-blue-600/30" : ""}`}
            >
              <span>
                <span className="inline-block w-6 text-blue-100/60">{i + 1}.</span>
                {row.username}
              </span>
              <span className="font-semibold text-yellow-300">🪙 {row.coins.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* My predictions (active bets only) */}
      <Section title="My predictions">
        {pendingGroups.length === 0 ? (
          <Empty text="No active bets right now. Pick a match below! (Finished bets are in 📊 My Log.)" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingGroups.map((bets) => (
              <MatchBetsCard
                key={(bets[0] as any).match_id}
                bets={bets}
                token={token}
                coins={player.coins}
                onChange={onRefresh}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Daily challenges */}
      <Section title="🎯 Daily challenges">
        <ChallengesSection token={token} onClaimed={onRefresh} />
      </Section>

      {/* Mini-games */}
      <Section title="🎮 Mini-games">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-4">
            <p className="font-bold">🎰 Daily Spin</p>
            <p className="mt-1 text-xs text-blue-100/70">Spin once a day for free bonus coins.</p>
            <button
              onClick={spin}
              disabled={!canSpin}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold disabled:opacity-40"
            >
              {canSpin ? "Spin now 🎰" : "Come back tomorrow"}
            </button>
          </div>
          <PenaltyShootout token={token} canPlay={canPenalty} onDone={onRefresh} />
        </div>
      </Section>

      {/* Matches */}
      <Section title="Upcoming matches">
        {matches.length === 0 ? (
          <Empty text="No open matches right now. Check back soon — new fixtures load automatically." />
        ) : (
          <>
            {competitions.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {["All", ...competitions].map((c) => (
                  <button
                    key={c}
                    onClick={() => pickComp(c)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${comp === c ? "bg-blue-600 text-white" : "bg-white/10 text-blue-100"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  token={token}
                  coins={player.coins}
                  myBets={predByMatch.get(m.id) ?? []}
                  isMotd={m.id === motdId}
                  onPlaced={onRefresh}
                />
              ))}
            </div>

            {filtered.length > visible && (
              <button
                onClick={() => setVisible((v) => v + 10)}
                className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-blue-100"
              >
                Show more ({filtered.length - visible} more)
              </button>
            )}
          </>
        )}
      </Section>
        </>
      )}

      <p className="mt-8 text-center text-xs text-blue-100/50">
        Free to play • Virtual coins only • No real money gambling
      </p>
      <p className="mt-1 text-center text-xs text-blue-100/40">
        v{VERSION} ·{" "}
        <button onClick={openChanges} className="underline">
          What&apos;s new
        </button>
        {hasUpdate && (
          <span className="ml-1 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-gray-900">
            Updated!
          </span>
        )}
      </p>

      {showChanges && <Changelog onClose={() => setShowChanges(false)} />}
    </main>
  );
}

/* ------------------------------ Changelog --------------------------------- */

function Changelog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#0f2143] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🆕 What&apos;s new</h2>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1 text-sm">
            Close
          </button>
        </div>
        <div className="mt-3 space-y-4">
          {CHANGELOG.map((r) => (
            <div key={r.version}>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-blue-300">v{r.version}</span>
                <span className="text-xs text-blue-100/50">{r.date}</span>
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-blue-100/80">
                {r.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- My Log --------------------------------- */
// Per-player history: record, net coins, and a line per settled bet.

function MyLog({
  predictions,
  player,
  token,
  onChange,
}: {
  predictions: Prediction[];
  player: Player;
  token: string;
  onChange: () => void;
}) {
  const settled = predictions.filter((p) => p.status !== "PENDING");
  const wins = settled.filter((p) => p.status === "WON").length;
  const losses = settled.filter((p) => p.status === "LOST").length;
  const pending = predictions.length - settled.length;
  const net = settled.reduce(
    (sum, p) => sum + (p.status === "WON" ? p.payout - p.stake : -p.stake),
    0
  );
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  const lvl = levelInfo(player.xp);
  const streak = player.win_streak ?? 0;

  return (
    <div className="mt-4">
      {/* Level */}
      <div className="rounded-xl bg-white/5 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">
            Level {lvl.level} · <span className="text-blue-300">{lvl.tier}</span>
          </span>
          <span className="text-blue-100/60">
            {streak > 0 ? `🔥 ${streak} win streak` : "XP"}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-blue-500" style={{ width: `${lvl.intoLevel}%` }} />
        </div>
        <div className="mt-1 text-right text-xs text-blue-100/60">{lvl.intoLevel}/100 XP to next level</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wins" value={`${wins}`} color="text-green-300" />
        <Stat label="Losses" value={`${losses}`} color="text-red-300" />
        <Stat label="Win rate" value={`${winRate}%`} />
        <Stat
          label="Net coins"
          value={`${net >= 0 ? "+" : ""}${net.toLocaleString()}`}
          color={net >= 0 ? "text-green-300" : "text-red-300"}
        />
      </div>

      {/* Achievements (claim coin rewards) */}
      <h2 className="mb-2 mt-6 text-lg font-bold">🏅 Badges & rewards</h2>
      <Achievements token={token} onClaimed={onChange} />

      <h2 className="mb-2 mt-6 text-lg font-bold">History</h2>
      {settled.length === 0 ? (
        <Empty text={pending > 0 ? "Your bets are still pending — results show here once matches finish." : "No finished bets yet. Place some predictions!"} />
      ) : (
        <div className="space-y-2">
          {settled.map((p) => {
            const m = p.matches;
            const delta = p.status === "WON" ? p.payout - p.stake : -p.stake;
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {m ? `${m.home_team} vs ${m.away_team}` : "Match"}
                    {m && m.home_score != null && (
                      <span className="text-blue-100/60"> · {m.home_score}–{m.away_score}</span>
                    )}
                  </div>
                  <div className="text-xs text-blue-100/70">
                    {describeCall(p.type, p.pick, p.exact_home, p.exact_away, m?.home_team ?? "Home", m?.away_team ?? "Away")} · staked {p.stake}
                  </div>
                </div>
                <div className={`text-right font-bold ${delta >= 0 ? "text-green-300" : "text-red-300"}`}>
                  {delta >= 0 ? `+${delta}` : delta} 🪙
                  <div className="text-xs font-normal text-blue-100/60">{p.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Daily challenges ----------------------------- */

type Challenge = {
  key: string;
  label: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
  claimable: boolean;
};

function ChallengesSection({ token, onClaimed }: { token: string; onClaimed: () => void }) {
  const [list, setList] = useState<Challenge[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/challenges", { headers: authHeaders(token) });
    if (res.ok) setList((await res.json()).challenges ?? []);
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  async function claim(key: string) {
    const res = await fetch("/api/challenges", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (res.ok) {
      celebrate(`🎯 Challenge done: +🪙${data.reward}!`);
      load();
      onClaimed();
    } else {
      toast(data.error ?? "Try again.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {list.map((c) => (
        <div key={c.key} className="rounded-xl bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold">{c.label}</span>
            <span className="text-xs text-yellow-300">🪙{c.reward}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-blue-500" style={{ width: `${(c.progress / c.target) * 100}%` }} />
          </div>
          <div className="mt-1 text-xs text-blue-100/60">
            {c.progress}/{c.target}
          </div>
          {c.claimed ? (
            <p className="mt-2 text-sm font-semibold text-green-300">✓ Claimed</p>
          ) : (
            <button
              onClick={() => claim(c.key)}
              disabled={!c.claimable}
              className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
            >
              {c.claimable ? "Claim reward" : "In progress"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}


/* --------------------------- Penalty Shootout ----------------------------- */
// Timing mini-game: tap Shoot when the ball lines up with the goal. Skill-based,
// once a day, capped reward — so it's fair and un-cheatable on the leaderboard.

function PenaltyShootout({
  token,
  canPlay,
  onDone,
}: {
  token: string;
  canPlay: boolean;
  onDone: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [shots, setShots] = useState(0);
  const [goals, setGoals] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  function start() {
    setStarted(true);
    setShots(0);
    setGoals(0);
    setResult(null);
    setDone(false);
    setReward(null);
  }

  async function shoot() {
    const bar = barRef.current;
    const mark = markRef.current;
    if (!bar || !mark || done) return;
    const b = bar.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    const frac = (m.left + m.width / 2 - b.left) / b.width; // 0..1
    const isGoal = frac >= 0.38 && frac <= 0.62;
    const newGoals = goals + (isGoal ? 1 : 0);
    const newShots = shots + 1;
    setResult(isGoal ? "⚽ GOAL!" : "🧤 Saved!");
    setGoals(newGoals);
    setShots(newShots);

    if (newShots >= 5) {
      setDone(true);
      const res = await fetch("/api/penalty", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ goals: newGoals }),
      });
      const data = await res.json();
      if (res.ok) {
        setReward(data.reward);
        if (data.reward > 0) celebrate(`⚽ ${newGoals}/5 — +🪙${data.reward}!`);
        onDone();
      }
    }
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="font-bold">⚽ Penalty Shootout</p>
      <p className="mt-1 text-xs text-blue-100/70">
        Tap Shoot when the ball lines up with the goal. 5 shots, 🪙30 each.
      </p>

      {!canPlay ? (
        <p className="mt-3 text-sm text-blue-100/60">Come back tomorrow ⚽</p>
      ) : !started ? (
        <button onClick={start} className="mt-3 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold">
          Play
        </button>
      ) : (
        <div className="mt-3">
          <div ref={barRef} className="relative h-8 overflow-hidden rounded-lg bg-white/10">
            <div className="absolute left-1/2 top-0 h-full w-[24%] -translate-x-1/2 bg-green-500/30" />
            <div
              ref={markRef}
              className="absolute top-0 h-full w-2 bg-yellow-400"
              style={{ animation: done ? "none" : "pen-slide 0.85s linear infinite alternate" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span>
              Shot {Math.min(shots + 1, 5)}/5 · Goals {goals}
            </span>
            <span className="font-bold">{result}</span>
          </div>
          {!done ? (
            <button onClick={shoot} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold">
              Shoot ⚽
            </button>
          ) : (
            <div className="mt-2 text-center text-sm font-bold text-yellow-200">
              {reward !== null ? `${goals}/5 goals · +🪙${reward}` : "…"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Achievements ------------------------------- */

type Achievement = {
  key: string;
  emoji: string;
  label: string;
  reward: number;
  got: boolean;
  claimed: boolean;
  claimable: boolean;
};

function Achievements({ token, onClaimed }: { token: string; onClaimed: () => void }) {
  const [list, setList] = useState<Achievement[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/achievements", { headers: authHeaders(token) });
    if (res.ok) setList((await res.json()).achievements ?? []);
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  async function claim(key: string) {
    const res = await fetch("/api/achievements", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (res.ok) {
      celebrate(`🏅 Badge reward: +🪙${data.reward}!`);
      load();
      onClaimed();
    } else {
      toast(data.error ?? "Try again.");
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {list.map((a) => (
        <div
          key={a.key}
          className={`rounded-xl p-2 text-center text-xs ${a.got ? "bg-blue-600/30" : "bg-white/5 opacity-50"}`}
        >
          <div className="text-2xl">{a.emoji}</div>
          <div className="mt-1 font-semibold">{a.label}</div>
          <div className="text-yellow-300">🪙{a.reward}</div>
          {a.claimable ? (
            <button
              onClick={() => claim(a.key)}
              className="mt-1 w-full rounded bg-blue-600 px-2 py-1 text-xs font-bold"
            >
              Claim
            </button>
          ) : a.claimed ? (
            <div className="mt-1 text-green-300">✓ Claimed</div>
          ) : (
            <div className="mt-1 text-blue-100/50">Locked</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3 text-center">
      <div className={`text-xl font-extrabold ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-blue-100/60">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-white/5 p-4 text-sm text-blue-100/70">{text}</p>;
}

/* ------------------------------ Shared bits ------------------------------- */

// Small team flag / crest image (countries show flags, clubs show logos).
function Crest({ url }: { url: string | null }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      className="inline-block h-5 w-5 object-contain align-middle"
      onError={(e) => ((e.currentTarget.style.display = "none"))}
    />
  );
}

function TeamLine({
  home,
  away,
  homeCrest,
  awayCrest,
}: {
  home: string;
  away: string;
  homeCrest: string | null;
  awayCrest: string | null;
}) {
  return (
    <div className="mt-1 flex items-center justify-center gap-2 text-base font-bold">
      <Crest url={homeCrest} /> {home}
      <span className="text-blue-100/60">vs</span>
      {away} <Crest url={awayCrest} />
    </div>
  );
}

// Human-readable summary of a bet, e.g. "Half-time leader: Brazil" or "3+ goals: Yes".
function describeCall(
  type: BetType,
  pick: string | null,
  exactHome: number | null,
  exactAway: number | null,
  home: string,
  away: string
): string {
  const side = pick === "HOME" ? home : pick === "AWAY" ? away : "Draw";
  if (type === "WINNER") return `Winner: ${side}`;
  if (type === "HALFTIME") return `Half-time leader: ${side}`;
  if (type === "GOALS3") return `3+ goals: ${pick === "YES" ? "Yes" : "No"}`;
  if (type === "BTTS") return `Both teams score: ${pick === "YES" ? "Yes" : "No"}`;
  if (type === "TOTALS") return `Total goals: ${pick}`;
  return `Exact score: ${exactHome}–${exactAway}`;
}

type BetDraft = {
  type: BetType;
  pick: string | null;
  exactHome: number | null;
  exactAway: number | null;
  stake: number;
};

/* ------------------------------- Bet form --------------------------------- */
// Places (or edits) a single bet of a FIXED type. Type tabs live in MatchCard.

function BetForm({
  type,
  home,
  away,
  coins,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  type: BetType;
  home: string;
  away: string;
  coins: number; // max stake available
  initial?: BetDraft;
  submitLabel: string;
  onSubmit: (body: any) => Promise<{ error?: string }>;
  onCancel?: () => void;
}) {
  const [pick, setPick] = useState<string | null>(initial?.pick ?? null);
  const [eh, setEh] = useState(initial?.exactHome != null ? String(initial.exactHome) : "");
  const [ea, setEa] = useState(initial?.exactAway != null ? String(initial.exactAway) : "");
  const [stake, setStake] = useState(initial?.stake ?? 100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: any = { type, stake };
      if (type === "EXACT") {
        body.exactHome = Number(eh);
        body.exactAway = Number(ea);
      } else {
        body.pick = pick;
      }
      const res = await onSubmit(body);
      if (res?.error) setError(res.error);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    stake > 0 &&
    stake <= coins &&
    (type === "EXACT" ? eh !== "" && ea !== "" : pick !== null);

  const sideButtons: ReadonlyArray<readonly [string, string]> =
    type === "GOALS3"
      ? [
          ["YES", "Yes, 3+"],
          ["NO", "Under 3"],
        ]
      : type === "BTTS"
        ? [
            ["YES", "Yes"],
            ["NO", "No"],
          ]
        : type === "TOTALS"
          ? [
              ["0-1", "0–1"],
              ["2-3", "2–3"],
              ["4+", "4+"],
            ]
          : [
              ["HOME", home],
              ["DRAW", "Draw"],
              ["AWAY", away],
            ];
  const twoCols = type === "GOALS3" || type === "BTTS";

  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold text-blue-100/80">{BET_PROMPTS[type]}</p>
      {type === "EXACT" ? (
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min={0}
            value={eh}
            onChange={(e) => setEh(e.target.value)}
            className="w-16 rounded-lg bg-white/95 px-2 py-1.5 text-center text-gray-900"
          />
          <span>:</span>
          <input
            type="number"
            min={0}
            value={ea}
            onChange={(e) => setEa(e.target.value)}
            className="w-16 rounded-lg bg-white/95 px-2 py-1.5 text-center text-gray-900"
          />
        </div>
      ) : (
        <div className={`grid gap-2 ${twoCols ? "grid-cols-2" : "grid-cols-3"}`}>
          {sideButtons.map(([opt, label]) => (
            <button
              key={opt}
              onClick={() => setPick(opt)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold ${pick === opt ? "bg-yellow-400 text-gray-900" : "bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-blue-100/70">Bet</span>
        <input
          type="number"
          min={1}
          max={coins}
          value={stake}
          onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value))))}
          className="w-24 rounded-lg bg-white/95 px-2 py-1.5 text-center text-gray-900"
        />
        <span className="text-xs text-blue-100/70">coins</span>
        {onCancel && (
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
            Close
          </button>
        )}
        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold disabled:opacity-40"
        >
          {busy ? "…" : submitLabel}
        </button>
      </div>

      {stake > 0 && (
        <p className="mt-2 text-center text-sm font-semibold text-yellow-200">
          → If correct, you win 🪙{(stake * BASE_MULT[type]).toLocaleString()}
          <span className="block text-xs font-normal text-blue-100/60">
            (unpopular picks win even more)
          </span>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

/* ------------------------------ Bet editor -------------------------------- */
// Edit (change pick/stake) or cancel/undo a pending bet. Used on the match card
// and in "My predictions".

function BetEditor({
  p,
  home,
  away,
  token,
  coins,
  onChange,
}: {
  p: Prediction;
  home: string;
  away: string;
  token: string;
  coins: number;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveEdit(body: any) {
    const res = await fetch("/api/predictions", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ ...body, predictionId: p.id }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Could not update bet." };
    setEditing(false);
    onChange();
    return {};
  }

  async function cancelBet() {
    if (!confirm("Cancel this bet and get your coins back?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "DELETE",
        headers: authHeaders(token),
        body: JSON.stringify({ predictionId: p.id }),
      });
      if (res.ok) onChange();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-3 rounded-lg bg-white/5 p-3">
        <BetForm
          type={p.type}
          home={home}
          away={away}
          coins={coins + p.stake}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          initial={{
            type: p.type,
            pick: p.pick,
            exactHome: p.exact_home,
            exactAway: p.exact_away,
            stake: p.stake,
          }}
          onSubmit={saveEdit}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        onClick={() => setEditing(true)}
        className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold"
      >
        ✏️ Edit
      </button>
      <button
        onClick={cancelBet}
        disabled={busy}
        className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-red-300 disabled:opacity-50"
      >
        🗑 Cancel / Undo
      </button>
    </div>
  );
}

/* ------------------------------ Match card -------------------------------- */

function MatchCard({
  match,
  token,
  coins,
  myBets,
  isMotd,
  onPlaced,
}: {
  match: Match;
  token: string;
  coins: number;
  myBets: Prediction[];
  isMotd?: boolean;
  onPlaced: () => void;
}) {
  const kickoff = new Date(match.kickoff_at);
  const [tab, setTab] = useState<BetType>("WINNER");

  // The player's bet of the currently selected type, if any.
  const betByType = new Map(myBets.map((b) => [b.type, b]));
  const current = betByType.get(tab);

  async function place(body: any) {
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...body, matchId: match.id }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Could not place prediction." };
    toast("Bet placed ✅");
    onPlaced();
    return {};
  }

  return (
    <div className={`rounded-xl bg-white/5 p-4 ${isMotd ? "ring-2 ring-yellow-400/70" : ""}`}>
      <div className="flex items-center justify-between text-xs text-blue-100/60">
        <span>{match.competition}</span>
        <span>
          {kickoff.toLocaleDateString()}{" "}
          {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {isMotd && (
        <div className="mt-1 text-center text-xs font-bold text-yellow-300">
          ⭐ Match of the Day — winning bets get a bonus!
        </div>
      )}
      <TeamLine
        home={match.home_team}
        away={match.away_team}
        homeCrest={match.home_crest}
        awayCrest={match.away_crest}
      />

      <p className="mt-2 text-center text-xs text-blue-100/60">
        💡 Place a bet on each option — backing the unpopular pick pays an underdog bonus.
      </p>

      {/* Bet-type tabs: ✓ marks ones you've already bet. */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {(Object.keys(BET_LABELS) as BetType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-2 py-1.5 font-semibold ${tab === t ? "bg-blue-600" : "bg-white/10"}`}
          >
            {betByType.has(t) ? "✓ " : ""}
            {BET_LABELS[t]}
          </button>
        ))}
      </div>

      {current ? (
        <div className="mt-3 rounded-lg bg-blue-600/20 px-3 py-2 text-sm">
          ✅ Your bet:{" "}
          <b>
            {describeCall(
              current.type,
              current.pick,
              current.exact_home,
              current.exact_away,
              match.home_team,
              match.away_team
            )}
          </b>{" "}
          · 🪙{current.stake}
          {current.status === "PENDING" && (
            <span className="block text-xs text-blue-100/70">
              Could win 🪙{potentialWin(current)} ({effMult(current)})
            </span>
          )}
          {current.status === "PENDING" && (
            <BetEditor
              p={current}
              home={match.home_team}
              away={match.away_team}
              token={token}
              coins={coins}
              onChange={onPlaced}
            />
          )}
        </div>
      ) : (
        <div className="mt-3">
          <BetForm
            type={tab}
            home={match.home_team}
            away={match.away_team}
            coins={coins}
            submitLabel="Predict"
            onSubmit={place}
          />
        </div>
      )}

      <WhoWins match={match} />
    </div>
  );
}

/* ----------------------------- Who-wins split ----------------------------- */
// Always-visible vote split (Winner bets) under a match that has bets.

function WhoWins({ match }: { match: Match }) {
  const s = match.bet_stats;
  if (!s) return null;
  const total = s.home + s.draw + s.away;
  if (total === 0) return null;
  const pct = (n: number) => Math.round((n / total) * 100);

  function label(pick: string) {
    return pick === "HOME" ? match.home_team : pick === "AWAY" ? match.away_team : "Draw";
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-2 text-xs">
      <p className="mb-1 font-semibold text-blue-100/70">Who wins? ({total} bet{total > 1 ? "s" : ""})</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        <div className="bg-yellow-400" style={{ width: `${pct(s.home)}%` }} />
        <div className="bg-blue-300" style={{ width: `${pct(s.draw)}%` }} />
        <div className="bg-sky-400" style={{ width: `${pct(s.away)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-blue-100/80">
        <span>🟨 {match.home_team} {pct(s.home)}%</span>
        <span>🟩 Draw {pct(s.draw)}%</span>
        <span>🟦 {match.away_team} {pct(s.away)}%</span>
      </div>
      {s.voters.length > 0 && (
        <p className="mt-1 text-blue-100/60">
          {s.voters.map((v) => `${v.username}: ${label(v.pick)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/* --------------------------- Match bets card ------------------------------ */
// All of a player's active bets on one match, grouped into a single card.

function MatchBetsCard({
  bets,
  token,
  coins,
  onChange,
}: {
  bets: Prediction[];
  token: string;
  coins: number;
  onChange: () => void;
}) {
  const m = bets[0].matches;
  const editable = !!m && new Date(m.kickoff_at) > new Date();

  return (
    <div className="rounded-xl bg-white/5 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold">
          <Crest url={m?.home_crest ?? null} />
          {m ? `${m.home_team} vs ${m.away_team}` : "Match"}
          <Crest url={m?.away_crest ?? null} />
        </span>
        <span className="text-xs text-blue-100/60">{editable ? "Open" : "Started"}</span>
      </div>

      <div className="mt-2 space-y-2">
        {bets.map((p) => (
          <div key={p.id} className="rounded-lg bg-white/5 p-2">
            <div className="text-xs text-blue-100/80">
              <b>
                {describeCall(p.type, p.pick, p.exact_home, p.exact_away, m?.home_team ?? "Home", m?.away_team ?? "Away")}
              </b>{" "}
              · Stake {p.stake} · could win 🪙{potentialWin(p)} ({effMult(p)})
            </div>
            {editable && m && (
              <BetEditor
                p={p}
                home={m.home_team}
                away={m.away_team}
                token={token}
                coins={coins}
                onChange={onChange}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
