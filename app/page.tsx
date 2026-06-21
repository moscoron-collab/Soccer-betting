"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { celebrate, confettiBurst, playCheer, toast } from "@/lib/celebrate";
import { VERSION, CHANGELOG } from "@/lib/changelog";
import { WHEEL, EXTRA_SPIN_COST, MAX_SPINS_PER_DAY, type WheelSlice } from "@/lib/wheel";
import { LangProvider, useLang } from "@/lib/i18n";
import { MAX_MESSAGE_LEN } from "@/lib/chat";

// Translator type, so helpers can take `t` without importing React context.
type T = (key: string, params?: Record<string, string | number>) => string;

// Friendly one-line summary of a wheel prize, in the player's language.
function prizeText(t: T, slice: WheelSlice): string {
  switch (slice.kind) {
    case "BOOST":
      return t("prize.boost", { n: slice.amount });
    case "SHIELD":
      return t("prize.shield", { n: slice.amount });
    case "JACKPOT":
      return t("prize.jackpot", { n: slice.amount.toLocaleString() });
    default:
      return slice.amount === 0
        ? t("prize.noWin")
        : t("prize.coins", { n: slice.amount.toLocaleString() });
  }
}

// The short label drawn on a wheel slice (numbers stay as-is, words translate).
function sliceLabel(t: T, slice: WheelSlice): string {
  if (slice.kind === "JACKPOT") return t("wheel.jackpot");
  if (slice.kind === "BOOST") return t("wheel.boost");
  if (slice.kind === "SHIELD") return t("wheel.shield");
  if (slice.amount === 0) return t("wheel.noWin");
  return slice.label;
}

// A small button that toggles between English and Hebrew.
function LangToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "he" : "en")}
      className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold"
      title="Language / שפה"
    >
      {t("lang.switch")}
    </button>
  );
}

// Preset avatars players can choose without uploading a photo.
const AVATAR_PRESETS = ["⚽", "🥅", "🧤", "👟", "🏆", "🦁", "🐯", "🐉", "🦅", "🦊", "🔥", "⭐", "👑", "😎", "🤖", "👻"];

const TOKEN_KEY = "spg_token";

// localStorage can throw (Safari Private Mode, storage disabled) — never let that
// crash the app or, worse, look like a sign-out.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

type Player = {
  id: string;
  username: string;
  coins: number;
  xp: number;
  win_streak: number;
  avatar?: string | null;
  hide_picks?: boolean;
  boost_2x?: number;
  streak_shield?: number;
  created_at?: string | null;
};
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
    voters: { username: string; avatar?: string | null; pick: string }[];
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
  boosted?: boolean;
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

// All bet markets, in display order. Labels/prompts are translated via i18n keys
// `bet.<TYPE>` and `prompt.<TYPE>`.
const BET_TYPES: BetType[] = ["WINNER", "EXACT", "HALFTIME", "GOALS3", "BTTS", "TOTALS"];
const BASE_MULT: Record<BetType, number> = {
  WINNER: 2,
  EXACT: 5,
  HALFTIME: 2,
  GOALS3: 2,
  BTTS: 2,
  TOTALS: 3,
};

// Coins a pending bet would return if it wins (base × locked-in bonus × 2× boost).
function potentialWin(p: Prediction): number {
  return Math.round(p.stake * BASE_MULT[p.type] * (p.bonus_mult ?? 1) * (p.boosted ? 2 : 1));
}

// The effective multiplier shown to players (base × bonus × boost), so stake × this = could-win.
function effMult(p: Prediction): string {
  const m = BASE_MULT[p.type] * (p.bonus_mult ?? 1) * (p.boosted ? 2 : 1);
  const s = Number.isInteger(m) ? `${m}` : m.toFixed(1);
  const flames = (p.bonus_mult ?? 1) > 1 ? " 🔥" : "";
  const bolt = p.boosted ? " ⚡" : "";
  return `×${s}${flames}${bolt}`;
}

// Level/tier from XP (100 XP per level). `tierKey` maps to an i18n `tier.*` key.
// Tiers are intentionally easy to reach early so progress feels rewarding.
function levelInfo(xp: number) {
  const level = Math.min(100, Math.floor((xp || 0) / 100) + 1);
  const tierKey =
    level >= 75 ? "legend" : level >= 35 ? "expert" : level >= 15 ? "scout" : level >= 5 ? "analyst" : "rookie";
  return { level, tierKey, intoLevel: (xp || 0) % 100 };
}

type LeaderRow = { username: string; coins: number; avatar?: string | null; created_at?: string | null };

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", "x-player-token": token };
}

// A player counts as "new" (gets the 🌱 badge) for their first week.
const NEW_PLAYER_DAYS = 7;
function isNewPlayer(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < NEW_PLAYER_DAYS * 86_400_000;
}

// "June 2026" in the player's language, for "Member since …".
function joinedMonth(createdAt: string, lang: string): string {
  return new Date(createdAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-US", {
    year: "numeric",
    month: "long",
  });
}

// The player's local timezone, so daily features (spin/penalty/top-up) reset at
// their local midnight. Auto-detected from the browser.
function clientTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function Page() {
  return (
    <LangProvider>
      <Home />
    </LangProvider>
  );
}

function Home() {
  const { t } = useLang();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [canBailout, setCanBailout] = useState(false);
  const [spinsLeft, setSpinsLeft] = useState(0);
  const [nextSpinFree, setNextSpinFree] = useState(false);
  const [canPenalty, setCanPenalty] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const firstLoad = useRef(true);
  const [recap, setRecap] = useState<{ won: number; lost: number; net: number; gained: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showGift, setShowGift] = useState(false);

  // Load token from storage on first render.
  useEffect(() => {
    setToken(safeGet(TOKEN_KEY));
    setReady(true);
  }, []);

  const loadMe = useCallback(async (tok: string) => {
    let res: Response;
    try {
      res = await fetch(`/api/me?tz=${encodeURIComponent(clientTz())}&_=${Date.now()}`, {
        headers: authHeaders(tok),
        cache: "no-store",
      });
    } catch {
      // Network blip (flaky mobile/Wi-Fi) — keep the session, retry next poll.
      return;
    }
    // Only a genuine 401 (unknown token) signs out. A 5xx/503 is a temporary
    // server/database hiccup: keep the player logged in and try again later.
    if (res.status === 401) {
      safeRemove(TOKEN_KEY);
      setToken(null);
      setPlayer(null);
      return;
    }
    if (!res.ok) return;
    let data: any;
    try {
      data = await res.json();
    } catch {
      return;
    }
    if (!data || !data.player) return; // never blank out a logged-in player
    if (data.welcomeGift) {
      setShowGift(true);
      confettiBurst();
      playCheer();
    }
    const preds: Prediction[] = data.predictions ?? [];

    // Results the player hasn't seen yet (settled while they were away or watching).
    const settled = preds.filter((p) => p.status !== "PENDING");
    const raw = safeGet("spg_seen_settled");
    const seen = new Set<string>(raw ? JSON.parse(raw) : []);
    const fresh = settled.filter((p) => !seen.has(p.id));

    if (raw === null) {
      // First time on this device — set a baseline, don't recap old history.
    } else if (fresh.length > 0) {
      const won = fresh.filter((p) => p.status === "WON");
      const lost = fresh.filter((p) => p.status === "LOST");
      const gained = won.reduce((s, p) => s + p.payout, 0);
      const net = fresh.reduce((s, p) => s + (p.status === "WON" ? p.payout - p.stake : -p.stake), 0);

      if (firstLoad.current) {
        // Opened the app and found new results — show a welcome-back recap.
        setRecap({ won: won.length, lost: lost.length, net, gained });
        if (won.length > 0) {
          confettiBurst();
          playCheer();
        }
      } else if (won.length > 0) {
        // A win landed while watching live.
        celebrate(t("welcome.liveWin", { g: gained.toLocaleString() }));
      }
    }
    safeSet("spg_seen_settled", JSON.stringify(settled.map((p) => p.id)));
    firstLoad.current = false;

    setPlayer(data.player);
    setPredictions(preds);
    setCanBailout(!!data.canBailout);
    setSpinsLeft(data.spinsLeft ?? 0);
    setNextSpinFree(!!data.nextSpinFree);
    setCanPenalty(!!data.canPenalty);
    setLeaderboard(data.leaderboard ?? []);
  }, [t]);

  useEffect(() => {
    if (token) loadMe(token);
  }, [token, loadMe]);

  // Show the one-time welcome once the new player's profile has loaded. The flag
  // is set by the signup form (see AuthScreen).
  useEffect(() => {
    if (player && safeGet("spg_welcome") === "1") {
      safeRemove("spg_welcome");
      setShowWelcome(true);
    }
  }, [player]);

  // Poll every 60s so wins pop while you're watching.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => loadMe(token), 60000);
    return () => clearInterval(id);
  }, [token, loadMe]);

  function onSignedIn(tok: string) {
    safeSet(TOKEN_KEY, tok);
    setToken(tok);
  }

  function signOut() {
    safeRemove(TOKEN_KEY);
    setToken(null);
    setPlayer(null);
    setPredictions([]);
  }

  if (!ready) return null;

  return (
    <>
      <Toaster />
      {showWelcome && player && (
        <WelcomeNew name={player.username} onClose={() => setShowWelcome(false)} />
      )}
      {showGift && <WelcomeGift onClose={() => setShowGift(false)} />}
      {recap && <WelcomeBack data={recap} onClose={() => setRecap(null)} />}
      {!token || !player ? (
        <AuthScreen onSignedIn={onSignedIn} />
      ) : (
        <Game
          token={token}
          player={player}
          predictions={predictions}
          canBailout={canBailout}
          spinsLeft={spinsLeft}
          nextSpinFree={nextSpinFree}
          canPenalty={canPenalty}
          leaderboard={leaderboard}
          onRefresh={() => loadMe(token)}
          onSignOut={signOut}
        />
      )}
    </>
  );
}

/* --------------------------- New-player welcome --------------------------- */
// Shown once, right after signup: a warm greeting + a few how-to-play tips.

function WelcomeNew({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0f2143] p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl">🎉</div>
        <h2 className="mt-2 text-xl font-extrabold">{t("welcomeNew.title", { name })}</h2>
        <p className="mt-1 text-sm text-blue-100/70">{t("welcomeNew.subtitle")}</p>
        <p className="mt-3 text-sm font-semibold text-yellow-200">{t("welcomeNew.coins")}</p>

        <div className="mt-3 space-y-2 text-start text-sm">
          <p className="rounded-lg bg-white/5 p-2">{t("welcomeNew.tip1")}</p>
          <p className="rounded-lg bg-white/5 p-2">{t("welcomeNew.tip2")}</p>
          <p className="rounded-lg bg-white/5 p-2">{t("welcomeNew.tip3")}</p>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white"
        >
          {t("welcomeNew.start")}
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Warm-welcome gift ---------------------------- */
// One-time "+500 coins for participating" popup (server grants the coins).

function WelcomeGift({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0f2143] p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl">🎁</div>
        <h2 className="mt-2 text-xl font-extrabold">{t("gift.title")}</h2>
        <p className="mt-2 text-sm text-blue-100/80">{t("gift.body")}</p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white"
        >
          {t("gift.ok")}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- Welcome back ------------------------------- */
// Recap of bets that settled while the player was away, shown on app open.

function WelcomeBack({
  data,
  onClose,
}: {
  data: { won: number; lost: number; net: number; gained: number };
  onClose: () => void;
}) {
  const { t } = useLang();
  const positive = data.net >= 0;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0f2143] p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl">{data.won > 0 ? "🎉" : "👋"}</div>
        <h2 className="mt-2 text-xl font-extrabold">{t("welcome.title")}</h2>
        <p className="mt-1 text-sm text-blue-100/70">{t("welcome.subtitle")}</p>

        <div className="mt-4 space-y-1 text-sm">
          {data.won > 0 && (
            <p className="text-green-300">
              {t(data.won > 1 ? "welcome.wonMany" : "welcome.wonOne", {
                n: data.won,
                g: data.gained.toLocaleString(),
              })}
            </p>
          )}
          {data.lost > 0 && (
            <p className="text-red-300">
              {t(data.lost > 1 ? "welcome.lostMany" : "welcome.lostOne", { n: data.lost })}
            </p>
          )}
        </div>

        <p className={`mt-4 text-2xl font-extrabold ${positive ? "text-green-300" : "text-red-300"}`}>
          {t("welcome.net")} {positive ? "+" : ""}🪙{data.net.toLocaleString()}
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white"
        >
          {positive ? t("welcome.go") : t("common.ok")}
        </button>
      </div>
    </div>
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

// Always-visible coin balance, pinned to the bottom corner so it stays on screen
// while scrolling. `pointer-events-none` so it never blocks taps underneath.
function CoinChip({ coins }: { coins: number }) {
  return (
    <div className="pointer-events-none fixed bottom-4 z-50 ltr:right-4 rtl:left-4">
      <div className="flex items-center gap-1 rounded-full bg-[#0f2143]/90 px-4 py-2 text-lg font-extrabold text-yellow-300 shadow-lg ring-1 ring-white/15 backdrop-blur">
        🪙 <CountUp value={coins} />
      </div>
    </div>
  );
}

/* ------------------------------- Auth screen ------------------------------- */

function AuthScreen({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const { t } = useLang();
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
        setError(data.error ?? t("auth.somethingWrong"));
        return;
      }
      // Flag a fresh signup so Home shows the one-time welcome.
      if (mode === "signup") safeSet("spg_welcome", "1");
      onSignedIn(data.token);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = username.trim().length >= 2 && password.length >= 4;

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      <h1 className="text-3xl font-extrabold text-center">{t("app.title")}</h1>
      <p className="mt-2 text-center text-blue-100/80">{t("app.tagline")}</p>

      <div className="mt-8 rounded-2xl bg-white/5 p-5 shadow-lg backdrop-blur">
        <div className="mb-4 flex gap-2 rounded-xl bg-white/5 p-1">
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === "login" ? "bg-blue-600 text-white" : "text-blue-100"}`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            {t("auth.login")}
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-blue-600 text-white" : "text-blue-100"}`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            {t("auth.newPlayer")}
          </button>
        </div>

        <label className="text-sm font-medium">{t("auth.username")}</label>
        <input
          className="mt-1 w-full rounded-lg bg-white/95 px-3 py-2 text-gray-900 outline-none"
          value={username}
          maxLength={20}
          placeholder={t("auth.usernamePlaceholder")}
          autoCapitalize="none"
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="mt-3 block text-sm font-medium">{t("auth.password")}</label>
        <input
          type="password"
          className="mt-1 w-full rounded-lg bg-white/95 px-3 py-2 text-gray-900 outline-none"
          value={password}
          maxLength={50}
          placeholder={mode === "signup" ? t("auth.passwordChoose") : t("auth.passwordYour")}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
        />

        <button
          disabled={busy || !canSubmit}
          onClick={submit}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : mode === "signup" ? t("auth.start") : t("auth.login")}
        </button>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <p className="mt-3 text-center text-xs text-blue-100/60">
          {mode === "login" ? t("auth.loginHint") : t("auth.signupHint")}
        </p>
      </div>
      <p className="mt-6 text-center text-xs text-blue-100/60">{t("auth.footer")}</p>
    </main>
  );
}

/* --------------------------------- Game ----------------------------------- */

function Game({
  token,
  player,
  predictions,
  canBailout,
  spinsLeft,
  nextSpinFree,
  canPenalty,
  leaderboard,
  onRefresh,
  onSignOut,
}: {
  token: string;
  player: Player;
  predictions: Prediction[];
  canBailout: boolean;
  spinsLeft: number;
  nextSpinFree: boolean;
  canPenalty: boolean;
  leaderboard: LeaderRow[];
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const { t } = useLang();
  const [matches, setMatches] = useState<Match[]>([]);
  const [motdId, setMotdId] = useState<number | null>(null);
  const [comp, setComp] = useState("All");
  const [visible, setVisible] = useState(10);
  const [view, setView] = useState<"play" | "log">("play");
  const [showChanges, setShowChanges] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewPlayer, setViewPlayer] = useState<string | null>(null);
  const [seenVersion, setSeenVersion] = useState<string>(VERSION);

  useEffect(() => {
    setSeenVersion(safeGet("spg_seen_version") ?? "");
  }, []);
  const hasUpdate = seenVersion !== VERSION;

  function openChanges() {
    setShowChanges(true);
    safeSet("spg_seen_version", VERSION);
    setSeenVersion(VERSION);
  }

  const loadMatches = useCallback(async () => {
    const res = await fetch(`/api/matches?tz=${encodeURIComponent(clientTz())}&_=${Date.now()}`, {
      cache: "no-store",
    });
    const data = await res.json();
    setMatches(data.matches ?? []);
    setMotdId(data.motdId ?? null);
  }, []);

  useEffect(() => {
    loadMatches();
    // Keep matches fresh (other players' picks). The leaderboard comes from
    // /api/me, which the parent polls every 60s.
    const id = setInterval(loadMatches, 60000);
    return () => clearInterval(id);
  }, [loadMatches]);

  // Reload the player (+leaderboard, which now rides along on /api/me) and the
  // matches together, so balances and pictures stay in sync after any action.
  const refreshAll = useCallback(() => {
    onRefresh();
    loadMatches();
  }, [onRefresh, loadMatches]);

  async function share() {
    const url =
      process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL !== "http://localhost:3000"
        ? process.env.NEXT_PUBLIC_SITE_URL
        : window.location.origin;
    const text = t("share.text");
    if (navigator.share) {
      try {
        await navigator.share({ title: t("app.title"), text, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    alert(t("share.copied"));
  }

  async function bailout() {
    await fetch("/api/me", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ tz: clientTz() }),
    });
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

  // Match of the Day comes from the server (one fixed match per local day).

  // Pending bets grouped by match (one card per match) for "My predictions".
  const pendingByMatch = new Map<number, Prediction[]>();
  for (const p of predictions) {
    if (p.status !== "PENDING") continue;
    const mid = (p as any).match_id as number;
    const arr = pendingByMatch.get(mid) ?? [];
    arr.push(p);
    pendingByMatch.set(mid, arr);
  }
  const pendingGroups = Array.from(pendingByMatch.values()).sort(
    (a, b) =>
      new Date(a[0].matches?.kickoff_at ?? 0).getTime() -
      new Date(b[0].matches?.kickoff_at ?? 0).getTime()
  );

  function pickComp(c: string) {
    setComp(c);
    setVisible(10);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">
      {/* Always-visible coin balance while scrolling */}
      <CoinChip coins={player.coins} />
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettings(true)} title={t("game.settings")} className="shrink-0">
            <Avatar avatar={player.avatar} size={44} />
          </button>
          <div>
            <p className="text-sm text-blue-100/70">{t("game.playingAs")}</p>
            <h1 className="text-xl font-bold">{player.username}</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-blue-100/70">{t("game.coins")}</p>
          <p className="text-2xl font-extrabold text-yellow-300">
            🪙 <CountUp value={player.coins} />
          </p>
          <button
            onClick={openChanges}
            className="mt-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-blue-100"
          >
            v{VERSION} · {t("game.whatsNew")}
            {hasUpdate && (
              <span className="ml-1 rounded-full bg-yellow-400 px-1 text-[10px] font-bold text-gray-900">
                !
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <LangToggle />
        <button onClick={share} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold">
          {t("game.invite")}
        </button>
        <button onClick={() => setShowSettings(true)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
          {t("game.settings")}
        </button>
        <button onClick={onSignOut} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
          {t("game.signOut")}
        </button>
      </div>

      {canBailout && (
        <div className="mt-4 rounded-xl bg-yellow-500/20 p-4">
          <p className="text-sm">{t("game.lowCoins")}</p>
          <button
            onClick={bailout}
            className="mt-2 rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-900"
          >
            {t("game.getCoins")}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-2 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => setView("play")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${view === "play" ? "bg-blue-600 text-white" : "text-blue-100"}`}
        >
          {t("game.tabPlay")}
        </button>
        <button
          onClick={() => setView("log")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${view === "log" ? "bg-blue-600 text-white" : "text-blue-100"}`}
        >
          {t("game.tabLog")}
        </button>
      </div>

      {view === "log" && (
        <MyLog predictions={predictions} player={player} token={token} onChange={refreshAll} />
      )}

      {view === "play" && (
        <>
      {/* Leaderboard */}
      <Section title={t("game.leaderboard")}>
        <div className="mb-2 flex justify-end">
          <button
            onClick={refreshAll}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100"
          >
            {t("game.refresh")}
          </button>
        </div>
        <div className="overflow-hidden rounded-xl bg-white/5">
          {leaderboard.map((row, i) => (
            <button
              key={row.username + i}
              onClick={() => setViewPlayer(row.username)}
              title={t("game.viewLog", { name: row.username })}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-white/5 ${row.username === player.username ? "bg-blue-600/30" : ""}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 text-blue-100/60">{i + 1}.</span>
                <Avatar avatar={row.avatar} size={24} />
                <span className="truncate">{row.username}</span>
                {isNewPlayer(row.created_at) && (
                  <span title={t("badge.new")} className="shrink-0">🌱</span>
                )}
              </span>
              <span className="shrink-0 font-semibold text-yellow-300">
                🪙 {(row.coins ?? 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Chat */}
      <Section title={t("chat.title")}>
        <ChatBox token={token} onOpenPlayer={setViewPlayer} />
      </Section>

      {/* My predictions (active bets only) */}
      <Section title={t("game.myPredictions")}>
        {pendingGroups.length === 0 ? (
          <Empty text={t("game.noActiveBets")} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingGroups.map((bets) => (
              <MatchBetsCard
                key={(bets[0] as any).match_id}
                bets={bets}
                token={token}
                coins={player.coins}
                onChange={refreshAll}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Daily challenges */}
      <Section title={t("game.dailyChallenges")}>
        <ChallengesSection token={token} onClaimed={refreshAll} />
      </Section>

      {/* Mini-games */}
      <Section title={t("game.miniGames")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SpinWheel
            token={token}
            spinsLeft={spinsLeft}
            nextSpinFree={nextSpinFree}
            coins={player.coins}
            boost={player.boost_2x ?? 0}
            shields={player.streak_shield ?? 0}
            onDone={refreshAll}
          />
          <PenaltyShootout token={token} canPlay={canPenalty} onDone={refreshAll} />
        </div>
      </Section>

      {/* Matches */}
      <Section title={t("game.upcoming")}>
        {matches.length === 0 ? (
          <Empty text={t("game.noMatches")} />
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
                    {c === "All" ? t("game.all") : c}
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
                  boost={player.boost_2x ?? 0}
                  onOpenPlayer={setViewPlayer}
                  onPlaced={refreshAll}
                />
              ))}
            </div>

            {filtered.length > visible && (
              <button
                onClick={() => setVisible((v) => v + 10)}
                className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-blue-100"
              >
                {t("game.showMore", { n: filtered.length - visible })}
              </button>
            )}
          </>
        )}
      </Section>
        </>
      )}

      <p className="mt-8 text-center text-xs text-blue-100/50">{t("game.footer")}</p>
      <p className="mt-1 text-center text-xs text-blue-100/40">
        v{VERSION} ·{" "}
        <button onClick={openChanges} className="underline">
          {t("game.whatsNew")}
        </button>
        {hasUpdate && (
          <span className="ml-1 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-gray-900">
            {t("game.updated")}
          </span>
        )}
      </p>

      {showChanges && <Changelog onClose={() => setShowChanges(false)} />}
      {showSettings && (
        <SettingsModal
          player={player}
          token={token}
          onClose={() => setShowSettings(false)}
          onSaved={refreshAll}
        />
      )}
      {viewPlayer && (
        <PlayerLogModal username={viewPlayer} onClose={() => setViewPlayer(null)} />
      )}
    </main>
  );
}

/* ------------------------------ Settings ---------------------------------- */
// Profile picture (preset emoji or uploaded photo) + the "hide others' picks
// until kickoff" privacy toggle.

function SettingsModal({
  player,
  token,
  onClose,
  onSaved,
}: {
  player: Player;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useLang();
  const [avatar, setAvatar] = useState<string | null | undefined>(player.avatar);
  const [hidePicks, setHidePicks] = useState<boolean>(!!player.hide_picks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resize an uploaded image to a small square so it fits comfortably in the DB.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("settings.errImage"));
      return;
    }
    setError(null);
    try {
      const dataUrl = await resizeImage(file, 160);
      setAvatar(dataUrl);
    } catch {
      setError(t("settings.errRead"));
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ avatar: avatar ?? null, hidePicks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("settings.errSave"));
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#0f2143] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{t("game.settings")}</h2>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-2 py-1 text-sm">
            ✕
          </button>
        </div>

        {/* Current avatar preview */}
        <div className="mt-4 flex items-center gap-3">
          <Avatar avatar={avatar} size={56} />
          <div>
            <p className="font-bold">{player.username}</p>
            <p className="text-xs text-blue-100/60">{t("settings.profilePic")}</p>
            {player.created_at && (
              <p className="text-xs text-blue-100/50">
                {t("profile.memberSince", { date: joinedMonth(player.created_at, lang) })}
              </p>
            )}
          </div>
        </div>

        {/* Upload your own */}
        <div className="mt-4">
          <label className="block">
            <span className="text-sm font-semibold">{t("settings.upload")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="mt-1 block w-full text-xs text-blue-100/80 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </label>
        </div>

        {/* Or pick a preset */}
        <div className="mt-4">
          <p className="text-sm font-semibold">{t("settings.pickEmoji")}</p>
          <div className="mt-2 grid grid-cols-8 gap-2">
            {AVATAR_PRESETS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setAvatar(emoji)}
                className={`flex h-9 items-center justify-center rounded-lg text-lg ${avatar === emoji ? "bg-yellow-400" : "bg-white/10"}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          {avatar != null && avatar !== "" && (
            <button
              onClick={() => setAvatar(null)}
              className="mt-2 text-xs font-semibold text-blue-200 underline"
            >
              {t("settings.removePic")}
            </button>
          )}
        </div>

        {/* Privacy toggle */}
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
          <div>
            <p className="text-sm font-semibold">{t("settings.hideTitle")}</p>
            <p className="text-xs text-blue-100/60">{t("settings.hideDesc")}</p>
          </div>
          <button
            onClick={() => setHidePicks((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${hidePicks ? "bg-green-500" : "bg-white/20"}`}
            aria-pressed={hidePicks}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${hidePicks ? "left-[22px]" : "left-0.5"}`}
            />
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

        <button
          onClick={save}
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
      </div>
    </div>
  );
}

// Reads an image File and returns a resized square JPEG data URL.
function resizeImage(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        // Center-crop to a square, then scale down.
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* --------------------------- Player log modal ----------------------------- */
// Opens when you tap another player's avatar — shows their profile + bet log.

function PlayerLogModal({ username, onClose }: { username: string; onClose: () => void }) {
  const { t, lang } = useLang();
  const [data, setData] = useState<{
    player: { username: string; avatar: string | null; coins: number; win_streak: number; hide_picks?: boolean; created_at?: string | null };
    predictions: Prediction[];
    wins: number;
    losses: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/player?username=${encodeURIComponent(username)}`, {
          cache: "no-store",
        });
        const d = await res.json();
        if (!live) return;
        if (!res.ok) setError(d.error ?? t("playerLog.errLoad"));
        else setData(d);
      } catch {
        if (live) setError(t("playerLog.errLoad"));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [username, t]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#0f2143] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("playerLog.title")}</h2>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1 text-sm">
            {t("common.close")}
          </button>
        </div>

        {loading && <p className="mt-4 text-sm text-blue-100/70">{t("common.loading")}</p>}
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        {data && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <Avatar avatar={data.player.avatar} size={48} />
              <div>
                <p className="flex items-center gap-1.5 text-lg font-bold">
                  {data.player.username}
                  {isNewPlayer(data.player.created_at) && (
                    <span title={t("badge.new")}>🌱</span>
                  )}
                </p>
                <p className="text-xs text-blue-100/70">
                  {t("playerLog.coins", { coins: data.player.coins.toLocaleString() })}
                  {data.player.win_streak > 0 && <> · 🔥 {data.player.win_streak}</>}
                </p>
                {data.player.created_at && (
                  <p className="text-xs text-blue-100/50">
                    {t("profile.memberSince", { date: joinedMonth(data.player.created_at, lang) })}
                  </p>
                )}
              </div>
            </div>

            {/* Stats grid (same style as your own My Log) */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label={t("mylog.wins")} value={`${data.wins}`} color="text-green-300" />
              <Stat label={t("mylog.losses")} value={`${data.losses}`} color="text-red-300" />
              <Stat
                label={t("mylog.winRate")}
                value={`${data.wins + data.losses > 0 ? Math.round((data.wins / (data.wins + data.losses)) * 100) : 0}%`}
              />
            </div>

            {data.player.hide_picks && (
              <p className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-blue-100/60">
                {t("playerLog.hides")}
              </p>
            )}

            <div className="mt-4 space-y-2">
              {data.predictions.length === 0 ? (
                <p className="text-sm text-blue-100/70">{t("playerLog.noBets")}</p>
              ) : (
                data.predictions.map((p) => {
                  const m = p.matches;
                  const color =
                    p.status === "WON" ? "text-green-300" : p.status === "LOST" ? "text-red-300" : "text-blue-100/70";
                  return (
                    <div key={p.id} className="rounded-lg bg-white/5 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">
                          {m ? `${m.home_team} ${t("common.vs")} ${m.away_team}` : t("common.match")}
                        </span>
                        <span className={`font-bold ${color}`}>
                          {p.status === "PENDING"
                            ? t("common.pending")
                            : p.status === "WON"
                              ? `+🪙${p.payout}`
                              : t("common.lost")}
                        </span>
                      </div>
                      <div className="mt-0.5 text-blue-100/70">
                        {describeCall(
                          t,
                          p.type,
                          p.pick,
                          p.exact_home,
                          p.exact_away,
                          m?.home_team ?? t("common.home"),
                          m?.away_team ?? t("common.away")
                        )}{" "}
                        · 🪙{p.stake}
                        {p.boosted && <span className="text-amber-300"> ⚡2×</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Changelog --------------------------------- */

function Changelog({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
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
          <h2 className="text-lg font-bold">{t("changelog.title")}</h2>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1 text-sm">
            {t("common.close")}
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
  const { t } = useLang();
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
            {t("mylog.level", { n: lvl.level })} ·{" "}
            <span className="text-blue-300">{t(`tier.${lvl.tierKey}`)}</span>
          </span>
          <span className="text-blue-100/60">
            {streak > 0 ? t("mylog.winStreak", { n: streak }) : t("mylog.xp")}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-blue-500" style={{ width: `${lvl.intoLevel}%` }} />
        </div>
        <div className="mt-1 text-right text-xs text-blue-100/60">
          {t("mylog.xpToNext", { n: lvl.intoLevel })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("mylog.wins")} value={`${wins}`} color="text-green-300" />
        <Stat label={t("mylog.losses")} value={`${losses}`} color="text-red-300" />
        <Stat label={t("mylog.winRate")} value={`${winRate}%`} />
        <Stat
          label={t("mylog.netCoins")}
          value={`${net >= 0 ? "+" : ""}${net.toLocaleString()}`}
          color={net >= 0 ? "text-green-300" : "text-red-300"}
        />
      </div>

      {/* Achievements (claim coin rewards) */}
      <h2 className="mb-2 mt-6 text-lg font-bold">{t("mylog.badges")}</h2>
      <Achievements token={token} onClaimed={onChange} />

      <h2 className="mb-2 mt-6 text-lg font-bold">{t("mylog.history")}</h2>
      {settled.length === 0 ? (
        <Empty text={pending > 0 ? t("mylog.pendingEmpty") : t("mylog.noFinished")} />
      ) : (
        <div className="space-y-2">
          {settled.map((p) => {
            const m = p.matches;
            const delta = p.status === "WON" ? p.payout - p.stake : -p.stake;
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {m ? `${m.home_team} ${t("common.vs")} ${m.away_team}` : t("common.match")}
                    {m && m.home_score != null && (
                      <span className="text-blue-100/60"> · {m.home_score}–{m.away_score}</span>
                    )}
                  </div>
                  <div className="text-xs text-blue-100/70">
                    {describeCall(t, p.type, p.pick, p.exact_home, p.exact_away, m?.home_team ?? t("common.home"), m?.away_team ?? t("common.away"))} · {t("mylog.staked", { n: p.stake })}
                  </div>
                </div>
                <div className={`text-right font-bold ${delta >= 0 ? "text-green-300" : "text-red-300"}`}>
                  {delta >= 0 ? `+${delta}` : delta} 🪙
                  <div className="text-xs font-normal text-blue-100/60">
                    {p.status === "WON" ? t("common.won") : t("common.lost")}
                  </div>
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
  const { t } = useLang();
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
      celebrate(t("challenge.done", { r: data.reward }));
      load();
      onClaimed();
    } else {
      toast(data.error ?? t("common.tryAgain"));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {list.map((c) => (
        <div key={c.key} className="rounded-xl bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold">{t(`challenge.${c.key}`)}</span>
            <span className="text-xs text-yellow-300">🪙{c.reward}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-blue-500" style={{ width: `${(c.progress / c.target) * 100}%` }} />
          </div>
          <div className="mt-1 text-xs text-blue-100/60">
            {c.progress}/{c.target}
          </div>
          {c.claimed ? (
            <p className="mt-2 text-sm font-semibold text-green-300">{t("challenge.claimed")}</p>
          ) : (
            <button
              onClick={() => claim(c.key)}
              disabled={!c.claimable}
              className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
            >
              {c.claimable ? t("challenge.claim") : t("challenge.inProgress")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}


/* --------------------------------- Chat ----------------------------------- */
// One shared, moderated lobby. Polls every few seconds while open. Sending is
// validated/filtered server-side; authors and moderators can delete messages.

type ChatMessage = {
  id: string;
  body: string;
  kind: string;
  created_at: string;
  player_id: string;
  username: string;
  avatar: string | null;
};

function ChatBox({ token, onOpenPlayer }: { token: string; onOpenPlayer?: (u: string) => void }) {
  const { t } = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewer, setViewer] = useState<{ id: string; isAdmin: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat?_=${Date.now()}`, {
      headers: authHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setViewer(data.viewer ?? null);
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  async function send() {
    const body = input.trim();
    if (!body) {
      toast(t("chat.errEmpty"));
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data.code as string | undefined;
        const key =
          code === "TOO_LONG"
            ? "chat.errLong"
            : code === "NO_LINKS"
              ? "chat.errLinks"
              : code === "RATE"
                ? "chat.errRate"
                : code === "EMPTY"
                  ? "chat.errEmpty"
                  : "chat.errSend";
        toast(t(key));
        return;
      }
      setInput("");
      atBottomRef.current = true;
      load();
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/chat", {
      method: "DELETE",
      headers: authHeaders(token),
      body: JSON.stringify({ id }),
    });
    if (res.ok) load();
  }

  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div ref={scrollRef} onScroll={onScroll} className="h-64 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-blue-100/60">{t("chat.empty")}</p>
        ) : (
          messages.map((m) => {
            // Auto "join" announcements render as a centered system line.
            if (m.kind === "join") {
              return (
                <p key={m.id} className="py-1 text-center text-xs font-semibold text-green-200/80">
                  {t("chat.joined", { name: m.username })} 🌱
                </p>
              );
            }
            const canDelete = !!viewer && (viewer.isAdmin || viewer.id === m.player_id);
            const mine = viewer?.id === m.player_id;
            return (
              <div key={m.id} className="group flex items-start gap-2 text-sm">
                <button onClick={() => onOpenPlayer?.(m.username)} className="mt-0.5 shrink-0">
                  <Avatar avatar={m.avatar} size={26} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <button
                      onClick={() => onOpenPlayer?.(m.username)}
                      className={`font-semibold hover:underline ${mine ? "text-yellow-200" : "text-blue-200"}`}
                    >
                      {m.username}
                    </button>
                    <span className="text-[10px] text-blue-100/40">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {canDelete && (
                      <button
                        onClick={() => remove(m.id)}
                        title={t("chat.delete")}
                        className="ms-auto text-[11px] text-red-300/70 opacity-60 hover:text-red-300 group-hover:opacity-100"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  <p className="break-words text-blue-50/90">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sending && send()}
          maxLength={MAX_MESSAGE_LEN}
          placeholder={t("chat.placeholder")}
          className="min-w-0 flex-1 rounded-lg bg-white/95 px-3 py-2 text-sm text-gray-900 outline-none"
        />
        <button
          onClick={send}
          disabled={sending}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("chat.send")}
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] text-blue-100/40">{t("chat.rules")}</p>
    </div>
  );
}

/* ------------------------------ Spin Wheel -------------------------------- */
// A real spinning prize wheel. The server picks the winning slice; the wheel
// animates so the pointer lands on it. Prizes: coins, jackpot, and power-ups
// (2× payout charges and streak shields). One free spin a day, then pay coins.

const SPIN_MS = 4200;

function SpinWheel({
  token,
  spinsLeft,
  nextSpinFree,
  coins,
  boost,
  shields,
  onDone,
}: {
  token: string;
  spinsLeft: number;
  nextSpinFree: boolean;
  coins: number;
  boost: number;
  shields: number;
  onDone: () => void;
}) {
  const { t } = useLang();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelSlice | null>(null);

  const seg = 360 / WHEEL.length;
  const gradient = `conic-gradient(${WHEEL.map(
    (w, i) => `${w.color} ${i * seg}deg ${(i + 1) * seg}deg`
  ).join(", ")})`;

  const canPay = nextSpinFree || coins >= EXTRA_SPIN_COST;
  const canSpin = !spinning && spinsLeft > 0 && canPay;

  async function doSpin() {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);
    const res = await fetch("/api/spin", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ tz: clientTz() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error ?? t("common.tryAgain"));
      setSpinning(false);
      return;
    }

    const index = data.sliceIndex as number;
    // Rotate forward (≥5 turns) so the middle of `index` ends under the top pointer.
    const landing = (360 - (index * seg + seg / 2) + 360) % 360;
    setRotation((cur) => {
      const curMod = ((cur % 360) + 360) % 360;
      return cur + 360 * 5 + ((landing - curMod + 360) % 360);
    });

    setTimeout(() => {
      const slice = data.slice as WheelSlice;
      setResult(slice);
      celebrate(prizeText(t, slice));
      setSpinning(false);
      onDone();
    }, SPIN_MS);
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="font-bold">{t("spin.title")}</p>
      <p className="mt-1 text-xs text-blue-100/70">
        {t("spin.desc", { cost: EXTRA_SPIN_COST, max: MAX_SPINS_PER_DAY })}
      </p>

      {/* The wheel + pointer */}
      <div className="relative mx-auto mt-3 h-[200px] w-[200px]">
        {/* pointer */}
        <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2">
          <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-yellow-300 drop-shadow" />
        </div>
        <div
          className="h-full w-full rounded-full border-4 border-white/30 shadow-inner"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.17,0.67,0.12,0.99)` : "none",
          }}
        >
          {WHEEL.map((w, i) => (
            <div
              key={i}
              className="pointer-events-none absolute inset-0"
              style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}
            >
              <div className="absolute left-1/2 top-[10px] -translate-x-1/2 text-center text-[10px] font-bold leading-tight text-white drop-shadow">
                <div className="text-sm">{w.emoji}</div>
                {sliceLabel(t, w)}
              </div>
            </div>
          ))}
        </div>
        {/* hub */}
        <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 bg-[#0f2143]" />
      </div>

      {result && !spinning && (
        <p className="mt-3 text-center text-sm font-bold text-yellow-200">{prizeText(t, result)}</p>
      )}

      <button
        onClick={doSpin}
        disabled={!canSpin}
        className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold disabled:opacity-40"
      >
        {spinning
          ? t("spin.spinning")
          : spinsLeft <= 0
            ? t("spin.noSpins")
            : nextSpinFree
              ? t("spin.free")
              : coins >= EXTRA_SPIN_COST
                ? t("spin.again", { cost: EXTRA_SPIN_COST })
                : t("spin.need", { cost: EXTRA_SPIN_COST })}
      </button>

      <p className="mt-2 text-center text-[11px] text-blue-100/60">
        {spinsLeft > 0
          ? t(spinsLeft > 1 ? "spin.leftMany" : "spin.leftOne", { n: spinsLeft })
          : t("spin.comeback")}
      </p>

      {/* Power-up inventory */}
      <div className="mt-2 flex justify-center gap-3 text-xs text-blue-100/80">
        <span>{t("spin.boosts")} <b>{boost}</b></span>
        <span>{t("spin.shields")} <b>{shields}</b></span>
      </div>
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
  const { t } = useLang();
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
    setResult(isGoal ? t("penalty.goal") : t("penalty.saved"));
    setGoals(newGoals);
    setShots(newShots);

    if (newShots >= 5) {
      setDone(true);
      const res = await fetch("/api/penalty", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ goals: newGoals, tz: clientTz() }),
      });
      const data = await res.json();
      if (res.ok) {
        setReward(data.reward);
        if (data.reward > 0) celebrate(t("penalty.celebrate", { g: newGoals, r: data.reward }));
        onDone();
      }
    }
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="font-bold">{t("penalty.title")}</p>
      <p className="mt-1 text-xs text-blue-100/70">{t("penalty.desc")}</p>

      {!canPlay ? (
        <p className="mt-3 text-sm text-blue-100/60">{t("penalty.comeback")}</p>
      ) : !started ? (
        <button onClick={start} className="mt-3 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold">
          {t("penalty.play")}
        </button>
      ) : (
        <div className="mt-3">
          <div ref={barRef} className="relative h-8 overflow-hidden rounded-lg bg-white/10">
            <div className="absolute left-1/2 top-0 h-full w-[24%] -translate-x-1/2 bg-green-500/30" />
            <div
              ref={markRef}
              className="absolute top-0 h-full w-2 bg-yellow-400"
              style={{ animation: done ? "none" : "pen-slide 0.6s linear infinite alternate" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span>{t("penalty.shotLine", { n: Math.min(shots + 1, 5), g: goals })}</span>
            <span className="font-bold">{result}</span>
          </div>
          {!done ? (
            <button onClick={shoot} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold">
              {t("penalty.shoot")}
            </button>
          ) : (
            <div className="mt-2 text-center text-sm font-bold text-yellow-200">
              {reward !== null ? t("penalty.result", { g: goals, r: reward }) : "…"}
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
  const { t } = useLang();
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
      celebrate(t("ach.reward", { r: data.reward }));
      load();
      onClaimed();
    } else {
      toast(data.error ?? t("common.tryAgain"));
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
          <div className="mt-1 font-semibold">{t(`ach.${a.key}`)}</div>
          <div className="text-yellow-300">🪙{a.reward}</div>
          {a.claimable ? (
            <button
              onClick={() => claim(a.key)}
              className="mt-1 w-full rounded bg-blue-600 px-2 py-1 text-xs font-bold"
            >
              {t("ach.claim")}
            </button>
          ) : a.claimed ? (
            <div className="mt-1 text-green-300">{t("ach.claimed")}</div>
          ) : (
            <div className="mt-1 text-blue-100/50">{t("ach.locked")}</div>
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

// A player's profile picture: an uploaded image (data URL), a preset emoji, or a
// neutral fallback. `size` is the pixel dimension of the round badge.
function Avatar({
  avatar,
  size = 28,
}: {
  avatar?: string | null;
  size?: number;
}) {
  const isImage = !!avatar && avatar.startsWith("data:image/");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 align-middle"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar as string} alt="" className="h-full w-full object-cover" />
      ) : avatar ? (
        <span>{avatar}</span>
      ) : (
        <span>🙂</span>
      )}
    </span>
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
  const { t } = useLang();
  return (
    <div className="mt-1 flex items-center justify-center gap-2 text-base font-bold">
      <Crest url={homeCrest} /> {home}
      <span className="text-blue-100/60">{t("common.vs")}</span>
      {away} <Crest url={awayCrest} />
    </div>
  );
}

// Human-readable summary of a bet, e.g. "Half-time leader: Brazil" or "3+ goals: Yes".
function describeCall(
  t: T,
  type: BetType,
  pick: string | null,
  exactHome: number | null,
  exactAway: number | null,
  home: string,
  away: string
): string {
  const side = pick === "HOME" ? home : pick === "AWAY" ? away : t("common.draw");
  const yn = pick === "YES" ? t("common.yes") : t("common.no");
  if (type === "WINNER") return t("call.winner", { side });
  if (type === "HALFTIME") return t("call.halftime", { side });
  if (type === "GOALS3") return t("call.goals3", { yn });
  if (type === "BTTS") return t("call.btts", { yn });
  if (type === "TOTALS") return t("call.totals", { pick: pick ?? "" });
  return t("call.exact", { h: exactHome ?? 0, a: exactAway ?? 0 });
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
  boost = 0,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  type: BetType;
  home: string;
  away: string;
  coins: number; // max stake available
  boost?: number; // available 2× power-ups (0 = no boost option shown)
  initial?: BetDraft;
  submitLabel: string;
  onSubmit: (body: any) => Promise<{ error?: string }>;
  onCancel?: () => void;
}) {
  const { t } = useLang();
  const [pick, setPick] = useState<string | null>(initial?.pick ?? null);
  const [eh, setEh] = useState(initial?.exactHome != null ? String(initial.exactHome) : "");
  const [ea, setEa] = useState(initial?.exactAway != null ? String(initial.exactAway) : "");
  const [stake, setStake] = useState(initial?.stake ?? 100);
  const [useBoost, setUseBoost] = useState(false);
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
      if (useBoost && boost > 0) body.boosted = true;
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
          ["YES", t("form.yes3")],
          ["NO", t("form.under3")],
        ]
      : type === "BTTS"
        ? [
            ["YES", t("common.yes")],
            ["NO", t("common.no")],
          ]
        : type === "TOTALS"
          ? [
              ["0-1", "0–1"],
              ["2-3", "2–3"],
              ["4+", "4+"],
            ]
          : [
              ["HOME", home],
              ["DRAW", t("common.draw")],
              ["AWAY", away],
            ];
  const twoCols = type === "GOALS3" || type === "BTTS";

  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold text-blue-100/80">{t(`prompt.${type}`)}</p>
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
        <span className="text-xs text-blue-100/70">{t("form.bet")}</span>
        <input
          type="number"
          min={1}
          max={coins}
          value={stake}
          onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value))))}
          className="w-24 rounded-lg bg-white/95 px-2 py-1.5 text-center text-gray-900"
        />
        <span className="text-xs text-blue-100/70">{t("form.coins")}</span>
        {onCancel && (
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">
            {t("common.close")}
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

      {boost > 0 && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={useBoost}
            onChange={(e) => setUseBoost(e.target.checked)}
            className="h-4 w-4 accent-amber-400"
          />
          <span className="font-semibold text-amber-200">
            {t("form.useBoost")}{" "}
            <span className="text-amber-200/70">{t("form.boostLeft", { n: boost })}</span>
          </span>
        </label>
      )}

      {stake > 0 && (
        <p className="mt-2 text-center text-sm font-semibold text-yellow-200">
          {t("form.ifCorrect", {
            n: (stake * BASE_MULT[type] * (useBoost && boost > 0 ? 2 : 1)).toLocaleString(),
          })}
          {useBoost && boost > 0 && <span className="text-amber-300"> ⚡2×</span>}
          <span className="block text-xs font-normal text-blue-100/60">{t("form.unpopular")}</span>
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
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveEdit(body: any) {
    const res = await fetch("/api/predictions", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ ...body, predictionId: p.id, tz: clientTz() }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? t("editor.errUpdate") };
    setEditing(false);
    onChange();
    return {};
  }

  async function cancelBet() {
    if (!confirm(t("editor.confirm"))) return;
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
          submitLabel={t("form.save")}
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
        {t("editor.edit")}
      </button>
      <button
        onClick={cancelBet}
        disabled={busy}
        className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-red-300 disabled:opacity-50"
      >
        {t("editor.cancel")}
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
  boost,
  onOpenPlayer,
  onPlaced,
}: {
  match: Match;
  token: string;
  coins: number;
  myBets: Prediction[];
  isMotd?: boolean;
  boost?: number;
  onOpenPlayer?: (username: string) => void;
  onPlaced: () => void;
}) {
  const { t } = useLang();
  const kickoff = new Date(match.kickoff_at);
  const [tab, setTab] = useState<BetType>("WINNER");

  // The player's bet of the currently selected type, if any.
  const betByType = new Map(myBets.map((b) => [b.type, b]));
  const current = betByType.get(tab);

  async function place(body: any) {
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...body, matchId: match.id, tz: clientTz() }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? t("card.errPlace") };
    toast(t("card.placed"));
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
        <div className="mt-1 text-center text-xs font-bold text-yellow-300">{t("card.motd")}</div>
      )}
      <TeamLine
        home={match.home_team}
        away={match.away_team}
        homeCrest={match.home_crest}
        awayCrest={match.away_crest}
      />

      <p className="mt-2 text-center text-xs text-blue-100/60">{t("card.tip")}</p>

      {/* Bet-type tabs: ✓ marks ones you've already bet. */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {BET_TYPES.map((bt) => (
          <button
            key={bt}
            onClick={() => setTab(bt)}
            className={`rounded-lg px-2 py-1.5 font-semibold ${tab === bt ? "bg-blue-600" : "bg-white/10"}`}
          >
            {betByType.has(bt) ? "✓ " : ""}
            {t(`bet.${bt}`)}
          </button>
        ))}
      </div>

      {current ? (
        <div className="mt-3 rounded-lg bg-blue-600/20 px-3 py-2 text-sm">
          {t("card.yourBet")}{" "}
          <b>
            {describeCall(
              t,
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
              {t("card.couldWin", { n: potentialWin(current), mult: effMult(current) })}
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
            boost={boost}
            submitLabel={t("form.predict")}
            onSubmit={place}
          />
        </div>
      )}

      <WhoWins match={match} onOpenPlayer={onOpenPlayer} />
    </div>
  );
}

/* ----------------------------- Who-wins split ----------------------------- */
// Always-visible vote split (Winner bets) under a match that has bets.

function WhoWins({
  match,
  onOpenPlayer,
}: {
  match: Match;
  onOpenPlayer?: (username: string) => void;
}) {
  const { t } = useLang();
  const s = match.bet_stats;
  if (!s) return null;
  const total = s.home + s.draw + s.away;
  if (total === 0) return null;
  const pct = (n: number) => Math.round((n / total) * 100);

  function label(pick: string) {
    return pick === "HOME" ? match.home_team : pick === "AWAY" ? match.away_team : t("common.draw");
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-2 text-xs">
      <p className="mb-1 font-semibold text-blue-100/70">
        {t(total > 1 ? "who.titleMany" : "who.titleOne", { n: total })}
      </p>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        <div className="bg-yellow-400" style={{ width: `${pct(s.home)}%` }} />
        <div className="bg-blue-300" style={{ width: `${pct(s.draw)}%` }} />
        <div className="bg-sky-400" style={{ width: `${pct(s.away)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-blue-100/80">
        <span>🟨 {match.home_team} {pct(s.home)}%</span>
        <span>🟩 {t("common.draw")} {pct(s.draw)}%</span>
        <span>🟦 {match.away_team} {pct(s.away)}%</span>
      </div>
      {s.voters.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-blue-100/60">
          {s.voters.map((v, i) => (
            <button
              key={i}
              onClick={() => onOpenPlayer?.(v.username)}
              className="inline-flex items-center gap-1 hover:underline"
              title={t("game.viewLog", { name: v.username })}
            >
              <Avatar avatar={v.avatar} size={16} />
              {v.username}: {label(v.pick)}
            </button>
          ))}
        </div>
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
  const { t } = useLang();
  const m = bets[0].matches;
  const editable = !!m && new Date(m.kickoff_at) > new Date();

  return (
    <div className="rounded-xl bg-white/5 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold">
          <Crest url={m?.home_crest ?? null} />
          {m ? `${m.home_team} ${t("common.vs")} ${m.away_team}` : t("common.match")}
          <Crest url={m?.away_crest ?? null} />
        </span>
        <span className="text-xs text-blue-100/60">{editable ? t("card.open") : t("card.started")}</span>
      </div>

      <div className="mt-2 space-y-2">
        {bets.map((p) => (
          <div key={p.id} className="rounded-lg bg-white/5 p-2">
            <div className="text-xs text-blue-100/80">
              <b>
                {describeCall(t, p.type, p.pick, p.exact_home, p.exact_away, m?.home_team ?? t("common.home"), m?.away_team ?? t("common.away"))}
              </b>{" "}
              · {t("card.betLine", { s: p.stake, w: potentialWin(p), mult: effMult(p) })}
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
