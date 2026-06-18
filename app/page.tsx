"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "spg_token";

type Player = { id: string; username: string; coins: number };
type BetType = "WINNER" | "EXACT" | "HALFTIME" | "GOALS3";
type Match = {
  id: number;
  competition: string;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  kickoff_at: string;
};
type Prediction = {
  id: string;
  type: BetType;
  pick: string | null;
  exact_home: number | null;
  exact_away: number | null;
  stake: number;
  payout: number;
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
  WINNER: "Winner / Draw (2×)",
  EXACT: "Exact score (5×)",
  HALFTIME: "Half-time leader (2×)",
  GOALS3: "3+ goals (2×)",
};
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
    setPlayer(data.player);
    setPredictions(data.predictions ?? []);
    setCanBailout(!!data.canBailout);
  }, []);

  useEffect(() => {
    if (token) loadMe(token);
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

  if (!token || !player) {
    return <AuthScreen onSignedIn={onSignedIn} />;
  }

  return (
    <Game
      token={token}
      player={player}
      predictions={predictions}
      canBailout={canBailout}
      onRefresh={() => loadMe(token)}
      onSignOut={signOut}
    />
  );
}

/* ------------------------------- Auth screen ------------------------------- */

function AuthScreen({ onSignedIn }: { onSignedIn: (t: string) => void }) {
  const [mode, setMode] = useState<"new" | "recover">("new");
  const [username, setUsername] = useState("");
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAccount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
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

  async function recover() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", { headers: authHeaders(recovery.trim()) });
      if (!res.ok) {
        setError("That recovery code didn't work.");
        return;
      }
      onSignedIn(recovery.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <h1 className="text-3xl font-extrabold text-center">⚽ Soccer Predictor</h1>
      <p className="mt-2 text-center text-blue-100/80">
        Predict real matches. Win coins. Top the leaderboard.
      </p>

      <div className="mt-8 rounded-2xl bg-white/5 p-5 shadow-lg backdrop-blur">
        <div className="mb-4 flex gap-2 rounded-xl bg-white/5 p-1">
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === "new" ? "bg-blue-600 text-white" : "text-blue-100"}`}
            onClick={() => setMode("new")}
          >
            New player
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === "recover" ? "bg-blue-600 text-white" : "text-blue-100"}`}
            onClick={() => setMode("recover")}
          >
            I have a code
          </button>
        </div>

        {mode === "new" ? (
          <>
            <label className="text-sm font-medium">Pick a username</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/95 px-3 py-2 text-gray-900 outline-none"
              value={username}
              maxLength={20}
              placeholder="e.g. GoalMachine"
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAccount()}
            />
            <button
              disabled={busy || username.trim().length < 2}
              onClick={createAccount}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Creating…" : "Start playing (1,000 coins)"}
            </button>
          </>
        ) : (
          <>
            <label className="text-sm font-medium">Your recovery code</label>
            <input
              className="mt-1 w-full rounded-lg bg-white/95 px-3 py-2 text-gray-900 outline-none"
              value={recovery}
              placeholder="paste your code"
              onChange={(e) => setRecovery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && recover()}
            />
            <button
              disabled={busy || recovery.trim().length < 6}
              onClick={recover}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Checking…" : "Log back in"}
            </button>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
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
  onRefresh,
  onSignOut,
}: {
  token: string;
  player: Player;
  predictions: Prediction[];
  canBailout: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [showCode, setShowCode] = useState(false);
  const [comp, setComp] = useState("All");
  const [visible, setVisible] = useState(10);

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

  // Map of matchId -> the player's existing prediction (if any), so each match card
  // can show "your pick" + the community panel without disappearing after you bet.
  const predByMatch = new Map<number, Prediction>(
    predictions.map((p) => [(p as any).match_id as number, p])
  );

  // Competition filter + "show more" to keep the match list short.
  const competitions = Array.from(new Set(matches.map((m) => m.competition)));
  const filtered = comp === "All" ? matches : matches.filter((m) => m.competition === comp);
  const shown = filtered.slice(0, visible);

  function pickComp(c: string) {
    setComp(c);
    setVisible(10);
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
            🪙 {player.coins.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={share} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold">
          🔗 Invite a friend
        </button>
        <button
          onClick={() => setShowCode((v) => !v)}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold"
        >
          {showCode ? "Hide" : "Show"} recovery code
        </button>
        <button onClick={onSignOut} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
          Sign out
        </button>
      </div>

      {showCode && (
        <div className="mt-2 break-all rounded-lg bg-white/10 p-3 text-xs text-blue-100">
          Save this to log in on another device:
          <br />
          <span className="font-mono text-yellow-200">{token}</span>
        </div>
      )}

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

      {/* My predictions */}
      <Section title="My predictions">
        {predictions.length === 0 ? (
          <Empty text="You haven't predicted anything yet. Pick a match below!" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {predictions.map((p) => (
              <PredictionCard key={p.id} p={p} token={token} coins={player.coins} onChange={onRefresh} />
            ))}
          </div>
        )}
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
                  myPrediction={predByMatch.get(m.id)}
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

      <p className="mt-8 text-center text-xs text-blue-100/50">
        Free to play • Virtual coins only • No real money gambling
      </p>
    </main>
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
// Used both for placing a new bet (MatchCard) and editing one (PredictionCard).

function BetForm({
  home,
  away,
  coins,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  home: string;
  away: string;
  coins: number; // max stake available
  initial?: BetDraft;
  submitLabel: string;
  onSubmit: (body: any) => Promise<{ error?: string }>;
  onCancel?: () => void;
}) {
  const [type, setTypeState] = useState<BetType>(initial?.type ?? "WINNER");
  const [pick, setPick] = useState<string | null>(initial?.pick ?? null);
  const [eh, setEh] = useState(initial?.exactHome != null ? String(initial.exactHome) : "");
  const [ea, setEa] = useState(initial?.exactAway != null ? String(initial.exactAway) : "");
  const [stake, setStake] = useState(initial?.stake ?? 100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setType(t: BetType) {
    setTypeState(t);
    setPick(null);
    setEh("");
    setEa("");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: any = { type, stake };
      if (type === "WINNER" || type === "HALFTIME" || type === "GOALS3") body.pick = pick;
      else {
        body.exactHome = Number(eh);
        body.exactAway = Number(ea);
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

  const sideButtons =
    type === "GOALS3"
      ? ([
          ["YES", "Yes, 3+"],
          ["NO", "Under 3"],
        ] as const)
      : ([
          ["HOME", home],
          ["DRAW", "Draw"],
          ["AWAY", away],
        ] as const);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {(Object.keys(BET_LABELS) as BetType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-lg px-2 py-1.5 font-semibold ${type === t ? "bg-blue-600" : "bg-white/10"}`}
          >
            {BET_LABELS[t]}
          </button>
        ))}
      </div>

      {type === "EXACT" ? (
        <div className="mt-2 flex items-center justify-center gap-2">
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
        <div className={`mt-2 grid gap-2 ${type === "GOALS3" ? "grid-cols-2" : "grid-cols-3"}`}>
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
        <span className="text-xs text-blue-100/70">Stake</span>
        <input
          type="number"
          min={1}
          max={coins}
          value={stake}
          onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value))))}
          className="w-24 rounded-lg bg-white/95 px-2 py-1.5 text-center text-gray-900"
        />
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
  myPrediction,
  onPlaced,
}: {
  match: Match;
  token: string;
  coins: number;
  myPrediction?: Prediction;
  onPlaced: () => void;
}) {
  const kickoff = new Date(match.kickoff_at);

  async function place(body: any) {
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...body, matchId: match.id }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Could not place prediction." };
    onPlaced();
    return {};
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <div className="flex items-center justify-between text-xs text-blue-100/60">
        <span>{match.competition}</span>
        <span>
          {kickoff.toLocaleDateString()}{" "}
          {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <TeamLine
        home={match.home_team}
        away={match.away_team}
        homeCrest={match.home_crest}
        awayCrest={match.away_crest}
      />

      {myPrediction ? (
        <div className="mt-3 rounded-lg bg-blue-600/20 px-3 py-2 text-sm">
          ✅ Your pick:{" "}
          <b>
            {describeCall(
              myPrediction.type,
              myPrediction.pick,
              myPrediction.exact_home,
              myPrediction.exact_away,
              match.home_team,
              match.away_team
            )}
          </b>{" "}
          · 🪙{myPrediction.stake}
          {myPrediction.status === "PENDING" && (
            <BetEditor
              p={myPrediction}
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
            home={match.home_team}
            away={match.away_team}
            coins={coins}
            submitLabel="Predict"
            onSubmit={place}
          />
        </div>
      )}

      <CommunityBets match={match} />
    </div>
  );
}

/* --------------------------- Community bets ------------------------------- */
// Shows who has bet on a match and the Home/Draw/Away split.

type MatchBet = {
  username: string;
  type: BetType;
  pick: string | null;
  exact_home: number | null;
  exact_away: number | null;
  stake: number;
};

function CommunityBets({ match }: { match: Match }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bets, setBets] = useState<MatchBet[]>([]);
  const [counts, setCounts] = useState({ HOME: 0, DRAW: 0, AWAY: 0 });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const res = await fetch(`/api/match-bets?matchId=${match.id}`);
        const data = await res.json();
        setBets(data.bets ?? []);
        setCounts(data.counts ?? { HOME: 0, DRAW: 0, AWAY: 0 });
      } finally {
        setLoading(false);
      }
    }
  }

  const totalHDA = counts.HOME + counts.DRAW + counts.AWAY;
  const pct = (n: number) => (totalHDA ? Math.round((n / totalHDA) * 100) : 0);

  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <button onClick={toggle} className="text-xs font-semibold text-blue-200">
        👥 {open ? "Hide" : "Who's betting?"}
      </button>

      {open && (
        <div className="mt-2 text-xs">
          {loading ? (
            <p className="text-blue-100/60">Loading…</p>
          ) : bets.length === 0 ? (
            <p className="text-blue-100/60">No one has bet on this match yet — be the first!</p>
          ) : (
            <>
              {totalHDA > 0 && (
                <div className="mb-3">
                  <div className="flex h-3 overflow-hidden rounded-full">
                    <div className="bg-yellow-400" style={{ width: `${pct(counts.HOME)}%` }} />
                    <div className="bg-blue-300" style={{ width: `${pct(counts.DRAW)}%` }} />
                    <div className="bg-sky-400" style={{ width: `${pct(counts.AWAY)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-blue-100/80">
                    <span>🟨 {match.home_team} {pct(counts.HOME)}%</span>
                    <span>🟩 Draw {pct(counts.DRAW)}%</span>
                    <span>🟦 {match.away_team} {pct(counts.AWAY)}%</span>
                  </div>
                </div>
              )}

              <p className="mb-1 font-semibold text-blue-100/80">{bets.length} player{bets.length > 1 ? "s" : ""} betting:</p>
              <div className="space-y-1">
                {bets.map((b, i) => (
                  <div key={i} className="flex justify-between rounded bg-white/5 px-2 py-1">
                    <span className="font-medium">{b.username}</span>
                    <span className="text-blue-100/70">
                      {describeCall(b.type, b.pick, b.exact_home, b.exact_away, match.home_team, match.away_team)} · 🪙{b.stake}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Prediction card ------------------------------ */

function PredictionCard({
  p,
  token,
  coins,
  onChange,
}: {
  p: Prediction;
  token: string;
  coins: number;
  onChange: () => void;
}) {
  const m = p.matches;

  const statusColor =
    p.status === "WON" ? "text-green-300" : p.status === "LOST" ? "text-red-300" : "text-blue-100/70";

  // Editable while the bet is pending and the match hasn't kicked off yet.
  const editable = p.status === "PENDING" && !!m && new Date(m.kickoff_at) > new Date();

  const yourCall = describeCall(
    p.type,
    p.pick,
    p.exact_home,
    p.exact_away,
    m?.home_team ?? "Home",
    m?.away_team ?? "Away"
  );

  return (
    <div className="rounded-xl bg-white/5 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold">
          <Crest url={m?.home_crest ?? null} />
          {m ? `${m.home_team} vs ${m.away_team}` : "Match"}
          <Crest url={m?.away_crest ?? null} />
        </span>
        <span className={`font-bold ${statusColor}`}>
          {p.status === "PENDING" ? "Pending" : p.status === "WON" ? `Won +${p.payout}` : "Lost"}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-blue-100/70">
        <span>
          <b>{yourCall}</b> · Stake {p.stake}
        </span>
        {m && m.home_score != null && (
          <span>
            Final {m.home_score}–{m.away_score}
            {m.half_home != null && ` (HT ${m.half_home}–${m.half_away})`}
          </span>
        )}
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
  );
}
