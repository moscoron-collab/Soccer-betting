"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { celebrate, confettiBurst, playCheer, playGroan, toast } from "@/lib/celebrate";
import { spinRatchet, loseWomp, winFanfareShort, winFanfareTriumph, isMuted } from "@/lib/sounds";
import { VERSION, CHANGELOG } from "@/lib/changelog";
import { WHEEL, COMEBACK_WHEEL, EXTRA_SPIN_COST, MAX_SPINS_PER_DAY, isWinningSlice, bigWinTier, type WheelSlice } from "@/lib/wheel";
import { FREE_BET_STAKE, MOTD_BONUS, isKnockoutStage } from "@/lib/payout";
import { LangProvider, useLang } from "@/lib/i18n";
import { MAX_MESSAGE_LEN } from "@/lib/chat";
import { MIN_LOAN_AMOUNT } from "@/lib/loan";
import type { Bracket, BracketMatch, BracketTeam } from "@/lib/bracket";

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
    case "FREEBET":
      return t("prize.freebet", { n: slice.amount });
    case "PCT": {
      const pct = Math.abs(slice.amount);
      const delta = slice.delta ?? 0;
      return delta >= 0
        ? t("prize.gain", { pct, n: delta.toLocaleString() })
        : t("prize.lose", { pct, n: Math.abs(delta).toLocaleString() });
    }
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
  if (slice.kind === "FREEBET") return t("wheel.freebet");
  if (slice.kind === "PCT") {
    const pct = Math.abs(slice.amount);
    return slice.amount >= 0 ? t("wheel.gain", { pct }) : t("wheel.lose", { pct });
  }
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

// Stable per-device id for the "one device = one account" rule. Generated once and
// kept in localStorage; sent on signup (to block a second account on this device)
// and on login (to claim the device for legacy accounts that predate this).
const DEVICE_KEY = "spg_device";
function getDeviceId(): string {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeSet(DEVICE_KEY, id);
  }
  return id;
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
  free_bets?: number;
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
  stage?: string | null;
  bet_stats?: {
    home: number;
    draw: number;
    away: number;
    voters: { username: string; avatar?: string | null; pick: string }[];
  };
};
type Prediction = {
  id: string;
  match_id: number;
  created_at?: string | null;
  type: BetType;
  pick: string | null;
  exact_home: number | null;
  exact_away: number | null;
  stake: number;
  payout: number;
  bonus_mult: number;
  boosted?: boolean;
  free_bet?: boolean;
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
    stage?: string | null;
  } | null;
};

// Group a player's bet log so every bet on the same match sits together, with the
// most recently-placed match first and the newest bet first within each match.
// (The lists arrive newest-first; a stable group-by-match preserves that order.)
function groupBetsByMatch(predictions: Prediction[]): Prediction[] {
  const byTime = [...predictions].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
  const byMatch = new Map<number, Prediction[]>();
  for (const p of byTime) {
    const arr = byMatch.get(p.match_id) ?? [];
    arr.push(p);
    byMatch.set(p.match_id, arr);
  }
  return Array.from(byMatch.values()).flat();
}

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

// The guaranteed multiplier locked in for a FRESH bet of this type — mirrors the
// server's computeBonusMult for the parts the client can know up front:
//   • a Featured Winner pays exactly the headline rate (this REPLACES the usual
//     bonuses — no underdog/MOTD stacks on it), and
//   • Match of the Day adds a fixed bonus on top of the base for any market.
// The underdog bonus is crowd-dependent, so it isn't included here — it's surfaced
// separately as "unpopular picks win even more".
function effectiveWinMult(
  type: BetType,
  isFeatured?: boolean,
  featuredMult?: number,
  isMotd?: boolean
): number {
  if (isFeatured && type === "WINNER") return featuredMult ?? BASE_MULT.WINNER;
  return BASE_MULT[type] * (isMotd ? 1 + MOTD_BONUS : 1);
}

// Level/tier from XP (100 XP per level). `tierKey` maps to an i18n `tier.*` key.
// Tiers are intentionally easy to reach early so progress feels rewarding.
function levelInfo(xp: number) {
  const level = Math.min(100, Math.floor((xp || 0) / 100) + 1);
  const tierKey =
    level >= 75 ? "legend" : level >= 35 ? "expert" : level >= 15 ? "scout" : level >= 5 ? "analyst" : "rookie";
  return { level, tierKey, intoLevel: (xp || 0) % 100 };
}

// Emoji shown next to a name on the leaderboard for each XP tier (low → high), so
// established players aren't bare once their 🌱 "new player" badge expires.
const TIER_EMOJI: Record<string, string> = {
  rookie: "🐣",
  analyst: "📊",
  scout: "🔭",
  expert: "🎯",
  legend: "👑",
};
function tierEmoji(xp: number | null | undefined): string {
  return TIER_EMOJI[levelInfo(xp ?? 0).tierKey] ?? "";
}

// Medals for the very top of the table, by rank, so the leaders stand out instead of
// sharing the same XP-tier emoji as the pack. Shown INSTEAD of the tier emoji for the
// top 3; everyone below keeps their tier emoji.
const RANK_MEDAL = ["👑", "🥈", "🥉"];
function rankMedal(rank: number): string {
  return RANK_MEDAL[rank - 1] ?? "";
}

type LeaderRow = {
  username: string;
  coins: number;
  netWorth?: number; // coins + coins locked in pending bets (the ranking value)
  inPlay?: number;
  avatar?: string | null;
  created_at?: string | null;
  xp?: number; // drives the tier emoji shown next to the name
};

type LoanRow = {
  id: string;
  amount: number;
  created_at: string;
  username: string; // the other party: who I owe, or who owes me
};

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", "x-player-token": token };
}

// Show the "ways to earn" helper when a player is at or below this balance.
const LOW_COINS = 500;

// Smooth-scroll to a section by id (used by the low-coins helper buttons).
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

// Device clocks can be wrong — a phone or tablet running ~10 minutes slow makes a
// match look like it's still open when it has already kicked off and the SERVER
// has locked betting. So we trust the server's clock: any API response carrying a
// `serverNow` timestamp updates this offset, and the betting countdown/lock use
// serverNow() instead of the raw device clock.
let serverClockOffsetMs = 0; // (server now) − (device now), in ms
function syncServerClock(serverNowIso: string | null | undefined) {
  if (!serverNowIso) return;
  const ms = new Date(serverNowIso).getTime();
  if (Number.isFinite(ms)) serverClockOffsetMs = ms - Date.now();
}
function serverNow(): number {
  return Date.now() + serverClockOffsetMs;
}

// Re-renders the calling component every `ms` so countdowns and the kickoff lock
// (both driven by serverNow()) stay live without a manual refresh.
function useTick(ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
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
  const [showComeback, setShowComeback] = useState(false);
  const [showComebackAlert, setShowComebackAlert] = useState(false);
  const [showRegularWheel, setShowRegularWheel] = useState(true);
  const [mustSpinToBet, setMustSpinToBet] = useState(false);
  const [comebackSpinsLeft, setComebackSpinsLeft] = useState(0);
  const [canPenalty, setCanPenalty] = useState(false);
  const [canLendToday, setCanLendToday] = useState(false);
  const [loansOwed, setLoansOwed] = useState<LoanRow[]>([]);
  const [loansOwedToMe, setLoansOwedToMe] = useState<LoanRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [welcomeBack, setWelcomeBack] = useState<{ giftAmount: number; awayHours: number } | null>(null);
  const firstLoad = useRef(true);
  const [recap, setRecap] = useState<{ won: number; lost: number; net: number; gained: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [rewards, setRewards] = useState<{
    login: { day: number; amount: number } | null;
    cashback: { amount: number } | null;
  } | null>(null);

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
    if (data.loginBonus || data.cashback) {
      setRewards({ login: data.loginBonus ?? null, cashback: data.cashback ?? null });
      confettiBurst();
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
        // Only celebrate on a NET gain, so an overall loss never gets confetti.
        setRecap({ won: won.length, lost: lost.length, net, gained });
        if (net > 0) {
          confettiBurst();
          playCheer();
        }
      } else if (net > 0) {
        // Came out ahead while watching live.
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
    setShowComeback(!!data.showComeback);
    setShowComebackAlert(!!data.showComebackAlert);
    setShowRegularWheel(data.showRegular !== false);
    setMustSpinToBet(!!data.mustSpinToBet);
    setComebackSpinsLeft(data.comebackSpinsLeft ?? 0);
    setCanPenalty(!!data.canPenalty);
    setCanLendToday(!!data.canLendToday);
    setLoansOwed(data.loansOwed ?? []);
    setLoansOwedToMe(data.loansOwedToMe ?? []);
    setLeaderboard(data.leaderboard ?? []);
    setMyRank(data.myRank ?? null);
    if (data.welcomeBack) {
      setWelcomeBack(data.welcomeBack);
      confettiBurst();
      playCheer();
    }
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
      {rewards && <DailyRewards data={rewards} onClose={() => setRewards(null)} />}
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
          showComeback={showComeback}
          showComebackAlert={showComebackAlert}
          showRegularWheel={showRegularWheel}
          mustSpinToBet={mustSpinToBet}
          comebackSpinsLeft={comebackSpinsLeft}
          canPenalty={canPenalty}
          canLendToday={canLendToday}
          loansOwed={loansOwed}
          loansOwedToMe={loansOwedToMe}
          leaderboard={leaderboard}
          myRank={myRank}
          welcomeBack={welcomeBack}
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

/* ----------------------------- Daily rewards ------------------------------ */
// "Here's what you just earned" — login bonus and/or loss cashback, on app open.

function DailyRewards({
  data,
  onClose,
}: {
  data: { login: { day: number; amount: number } | null; cashback: { amount: number } | null };
  onClose: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0f2143] p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl">🎁</div>
        <h2 className="mt-2 text-xl font-extrabold">{t("rewards.title")}</h2>
        <div className="mt-4 space-y-2 text-start text-sm">
          {data.login && (
            <p className="rounded-lg bg-white/5 p-2 text-green-200">
              {t("rewards.login", { n: data.login.day, amount: data.login.amount.toLocaleString() })}
            </p>
          )}
          {data.cashback && (
            <p className="rounded-lg bg-white/5 p-2 text-green-200">
              {t("rewards.cashback", { amount: data.cashback.amount.toLocaleString() })}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white"
        >
          {t("rewards.ok")}
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
        <div className="text-4xl">{data.net > 0 ? "🎉" : "👋"}</div>
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
        body: JSON.stringify({ username: username.trim(), password, deviceId: getDeviceId() }),
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

/* ----------------------------- Smart banner ------------------------------ */

function fmtMult(m: number): string {
  return Number.isInteger(m) ? `${m}` : (Math.round(m * 100) / 100).toString();
}

// The team a bet was backing (for "… on England"), else the fixture name.
function predTeam(p: Prediction): string {
  const m = p.matches;
  if (!m) return "";
  if (p.type === "WINNER" || p.type === "HALFTIME") {
    if (p.pick === "HOME") return m.home_team;
    if (p.pick === "AWAY") return m.away_team;
  }
  return `${m.home_team} v ${m.away_team}`;
}

type Tt = (k: string, p?: Record<string, string | number>) => string;

// "2d 5h" / "3h 10m" / "12m" — a friendly countdown that handles multi-day waits.
function fmtCountdown(t: Tt, mins: number): string {
  if (mins >= 1440) {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    return t("banner.dDH", { d, h });
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? t("banner.dHM", { h, m }) : t("banner.dM", { m });
}

// One live-games line for a match: full-time, live score, "locks in N min", or countdown.
function matchLine(t: Tt, m: any): string | null {
  const home = m.home_team,
    away = m.away_team;
  const hs = m.home_score ?? 0,
    as = m.away_score ?? 0;
  if (m.status === "FINISHED") return t("banner.fullTime", { home, away, hs, as });
  if (m.status === "IN_PLAY" || m.status === "PAUSED") return t("banner.live", { home, away, hs, as });
  const mins = Math.round((new Date(m.kickoff_at).getTime() - serverNow()) / 60000);
  if (mins <= 0) return null;
  if (mins <= 15) return t("banner.locksIn", { home, away, n: mins });
  return t("banner.kickoffIn", { home, away, time: fmtCountdown(t, mins) });
}

// The Match of the Day line (its own ⭐ wording, with the same timing logic).
function motdLine(t: Tt, m: any): string {
  const home = m.home_team,
    away = m.away_team;
  const hs = m.home_score ?? 0,
    as = m.away_score ?? 0;
  if (m.status === "FINISHED") return t("banner.motdFt", { home, away, hs, as });
  if (m.status === "IN_PLAY" || m.status === "PAUSED") return t("banner.motdLive", { home, away, hs, as });
  const mins = Math.round((new Date(m.kickoff_at).getTime() - serverNow()) / 60000);
  if (mins <= 0) return t("banner.motd", { home, away });
  return t("banner.motdIn", { home, away, time: fmtCountdown(t, mins) });
}

// Builds the localized marquee lines from the /api/banner feed + the player's own
// state. The feed is social-first: it leads with you and the table, then the
// community stats (best win rate, biggest movers, rivalries, new players) and
// records — and only THEN a few games, moved to the very end.
// Order = you → table → form → rivalries → newcomers → records → event → games.
function buildBannerMessages(
  t: Tt,
  data: any,
  player: Player,
  predictions: Prediction[],
  myRank: number | null,
  welcomeBack: { giftAmount: number; awayHours: number } | null
): string[] {
  const msgs: string[] = [];
  const n = (v: number) => v.toLocaleString();
  const now = Date.now();

  // 1) Welcome-back greeting (special, brief) first.
  if (welcomeBack) {
    msgs.push(t("banner.missedYou", { name: player.username, gift: n(welcomeBack.giftAmount) }));
  }

  // 1.5) Player headlines LEAD the feed (last 24h): the HIGHS first — biggest wins, hot
  //      climbers, gainers and streaks — then the drama (rank tumbles, big losses, on the
  //      ropes, cold streaks). Keeps the lead exciting, not all doom.
  const st = data.stories ?? {};
  // Highs
  if (data.climber?.name) {
    msgs.push(t("banner.climber", { name: data.climber.name, from: data.climber.from, to: data.climber.to }));
  }
  if (st.bigWin?.name) {
    msgs.push(t("banner.bigWin", { name: st.bigWin.name, payout: n(st.bigWin.payout), team: st.bigWin.team ?? "" }));
  }
  if (st.gainer?.name) {
    msgs.push(t("banner.gainer", { name: st.gainer.name, amount: n(st.gainer.amount) }));
  }
  if (st.hotStreak?.name) {
    msgs.push(t("banner.hotStreak", { name: st.hotStreak.name, n: st.hotStreak.n }));
  }
  if (st.mostActive?.name) {
    msgs.push(t("banner.mostActive", { name: st.mostActive.name, count: st.mostActive.count }));
  }
  // Lows / drama
  if (data.faller?.name) {
    msgs.push(t("banner.rankDrop", { name: data.faller.name, from: data.faller.from, to: data.faller.to }));
  }
  if (st.onRopes?.name) {
    msgs.push(t("banner.onRopes", { name: st.onRopes.name, coins: n(st.onRopes.coins), lost: n(st.onRopes.lost) }));
  }
  if (st.bigLoss?.name) {
    msgs.push(t("banner.bigLoss", { name: st.bigLoss.name, amount: n(st.bigLoss.amount), team: st.bigLoss.team ?? "" }));
  }
  if (st.coldStreak?.name) {
    msgs.push(t("banner.coldStreak", { name: st.coldStreak.name, n: st.coldStreak.n }));
  }

  // 2) Your own activity — the most personal hook leads the feed.
  const recentWon = predictions.find(
    (p) => p.status === "WON" && new Date(p.created_at ?? 0).getTime() >= now - 48 * 3_600_000
  );
  if (recentWon) msgs.push(t("banner.youWon", { payout: n(recentWon.payout), team: predTeam(recentWon) }));
  if ((player.win_streak ?? 0) >= 2) msgs.push(t("banner.streak", { n: player.win_streak }));
  if (myRank && myRank > 1) msgs.push(t("banner.yourRank", { rank: myRank }));
  if ((player.free_bets ?? 0) > 0) msgs.push(t("banner.freeBet"));

  // 3) The table — who's on top (the climber/rank-rise now leads the feed above).
  if (data.top?.name) msgs.push(t("banner.top", { name: data.top.name, networth: n(data.top.netWorth) }));
  if (Array.isArray(data.top3) && data.top3.length >= 3) {
    msgs.push(t("banner.top3", { a: data.top3[0].name, b: data.top3[1].name, c: data.top3[2].name }));
  }

  // 4) Recent form — the sharpest predictor (last 48h).
  if (data.bestWinRate?.name) {
    msgs.push(
      t("banner.winRate", {
        name: data.bestWinRate.name,
        pct: data.bestWinRate.pct,
        won: data.bestWinRate.won,
        total: data.bestWinRate.total,
      })
    );
  }

  // 5) Biggest movers — who gained/lost the most coins (last 48h).
  const mover = data.mover ?? {};
  if (mover.gainer?.name) msgs.push(t("banner.mover", { name: mover.gainer.name, amount: n(mover.gainer.amount) }));
  if (mover.faller?.name) msgs.push(t("banner.faller", { name: mover.faller.name, amount: n(mover.faller.amount) }));

  // 6) Rivalry — the tightest race on the table.
  if (data.rivalry?.chaser) {
    msgs.push(
      t("banner.rivalry", {
        chaser: data.rivalry.chaser,
        leader: data.rivalry.leader,
        gap: n(data.rivalry.gap),
        rank: data.rivalry.rank,
      })
    );
  }

  // 7) New players — say hi to whoever just joined.
  for (const nc of (data.newcomers ?? []) as any[]) {
    if (nc?.name) msgs.push(t("banner.newPlayer", { name: nc.name }));
  }

  // 8) Records (48h Hall of Fame).
  const hof = data.hallOfFame ?? {};
  if (hof.biggestWin?.name) {
    msgs.push(
      t("banner.biggestWin", { name: hof.biggestWin.name, stake: n(hof.biggestWin.stake), payout: n(hof.biggestWin.payout) })
    );
  }
  if (hof.biggestLoss?.name) {
    msgs.push(t("banner.biggestLoss", { name: hof.biggestLoss.name, amount: n(hof.biggestLoss.amount), team: hof.biggestLoss.team ?? "" }));
  }
  if (hof.biggestBet?.name) {
    msgs.push(t("banner.biggestBet", { name: hof.biggestBet.name, amount: n(hof.biggestBet.amount), team: hof.biggestBet.team ?? "" }));
  }

  // 9) Event (Road to the Final), when it's on.
  const ev = data.event;
  if (ev?.on) {
    msgs.push(t("banner.eventOn", { name: ev.name, mult: fmtMult(ev.mult) }));
    for (const fm of (ev.featuredMatches ?? []) as any[]) {
      msgs.push(t("banner.featured", { home: fm.home_team, away: fm.away_team, mult: fmtMult(fm.mult ?? ev.mult) }));
    }
    if (ev.jackpot > 0) msgs.push(t("banner.jackpot", { amount: n(ev.jackpot) }));
  }

  // 10) Games LAST and trimmed: live first (real-time action), then just a few of the
  //     soonest upcoming, then a couple of just-finished — so the feed is about the app,
  //     not a wall of "kicks off in…" countdowns. (Match of the Day still has its own
  //     gold "pop" bar below the ticker.)
  const all = (data.matches ?? []) as any[];
  const isLive = (m: any) => m.status === "IN_PLAY" || m.status === "PAUSED";
  const ms = (m: any) => new Date(m.kickoff_at).getTime();
  const live = all.filter(isLive);
  const upcoming = all
    .filter((m) => !isLive(m) && m.status !== "FINISHED" && ms(m) > now)
    .sort((a, b) => ms(a) - ms(b))
    .slice(0, 3);
  const finished = all
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => ms(b) - ms(a))
    .slice(0, 2);
  for (const m of [...live, ...upcoming, ...finished]) {
    const line = matchLine(t, m);
    if (line) msgs.push(line);
  }

  return msgs;
}

// Number input that saves on blur (used by the event admin panel).
function NumField({ label, value, step, onSave }: { label: string; value: number; step?: string; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-blue-100/80">{label}</span>
      <input
        type="number"
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const num = Number(v);
          if (Number.isFinite(num)) onSave(num);
        }}
        className="rounded bg-white/90 px-2 py-1 text-gray-900"
      />
    </label>
  );
}

function TextField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-blue-100/80">{label}</span>
      <input
        type="text"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v)}
        className="rounded bg-white/90 px-2 py-1 text-gray-900"
      />
    </label>
  );
}

// Compact per-game "× multiplier" box shown next to a selected featured match.
// Saves on blur; clamps to the same 1–10 range the server validates.
function FeaturedMultInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return (
    <input
      type="number"
      step="0.5"
      min="1"
      max="10"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 1 && n <= 10) onSave(Math.round(n * 100) / 100);
      }}
      aria-label="Winner multiplier"
      className="w-12 rounded bg-white px-1 py-1 text-center text-gray-900"
    />
  );
}

// Admin-only control panel: flip the banner public, toggle the event, set the
// featured multiplier / jackpot / featured-match override / event name.
function EventAdmin({
  token,
  initial,
  matches,
  onSaved,
}: {
  token: string;
  initial: any;
  matches: any[];
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [cfg, setCfg] = useState<any>(initial ?? {});
  const [saved, setSaved] = useState(false);

  const save = useCallback(
    async (patch: Record<string, any>) => {
      setCfg((c: any) => ({ ...c, ...patch })); // optimistic
      try {
        const res = await fetch("/api/admin/event", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          setCfg((await res.json()).config);
          setSaved(true);
          onSaved();
        }
      } catch {
        /* ignore */
      }
    },
    [token, onSaved]
  );

  return (
    <div className="mx-auto max-w-5xl px-3 pb-2 text-white">
      <div className="rounded-lg bg-black/30 p-3 text-sm">
        <div className="mb-2 font-bold">{t("admin.title")}</div>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.bannerPublic} onChange={(e) => save({ bannerPublic: e.target.checked })} />
          <span>{t("admin.bannerPublic")}</span>
        </label>
        <p className="mb-2 text-xs text-blue-100/70">{t("admin.previewNote")}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.comebackLive} onChange={(e) => save({ comebackLive: e.target.checked })} />
          <span>{t("admin.comebackLive")}</span>
        </label>
        <p className="mb-2 text-xs text-blue-100/70">{t("admin.comebackNote")}</p>
        <label className="mb-3 flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.eventOn} onChange={(e) => save({ eventOn: e.target.checked })} />
          <span>{t("admin.eventOn")}</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumField label={t("admin.mult")} value={cfg.featuredMult} step="0.5" onSave={(v) => save({ featuredMult: v })} />
          <NumField label={t("admin.jackpot")} value={cfg.jackpot} step="500" onSave={(v) => save({ jackpot: v })} />
          <TextField label={t("admin.eventName")} value={cfg.eventName ?? ""} onSave={(v) => save({ eventName: v })} />
        </div>

        <div className="mt-3 flex flex-col gap-1 text-xs">
          <span className="text-blue-100/80">{t("admin.override")}</span>
          <div className="flex flex-wrap gap-1">
            {matches.length === 0 && <span className="text-blue-100/60">—</span>}
            {matches.map((m) => {
              const sel = (cfg.featuredOverrides ?? []).includes(m.id);
              const mult = cfg.featuredMults?.[m.id] ?? cfg.featuredMult ?? 2.5;
              return (
                <div key={m.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const cur: number[] = cfg.featuredOverrides ?? [];
                      const nextIds = sel ? cur.filter((x) => x !== m.id) : [...cur, m.id];
                      const nextMults = { ...(cfg.featuredMults ?? {}) };
                      if (sel) delete nextMults[m.id]; // drop its × when unfeatured
                      else nextMults[m.id] = mult; // seed with the current default ×
                      save({ featuredOverrides: nextIds, featuredMults: nextMults });
                    }}
                    className={`rounded-full px-2 py-1 ${sel ? "bg-green-500 text-white" : "bg-white/80 text-gray-900"}`}
                  >
                    {sel ? "✓ " : ""}
                    {m.home_team} v {m.away_team}
                  </button>
                  {sel && (
                    <span className="flex items-center gap-0.5 text-white">
                      <FeaturedMultInput
                        value={mult}
                        onSave={(v) => save({ featuredMults: { ...(cfg.featuredMults ?? {}), [m.id]: v } })}
                      />
                      <span>×</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-blue-100/60">{t("admin.autoPick")}</span>
        </div>
        {saved && <div className="mt-2 text-xs text-green-300">{t("admin.saved")}</div>}
      </div>
    </div>
  );
}

// The scrolling marquee pinned to the very top. Reads /api/banner (world + event +
// records); personal lines come from the player props. Admin-only until made public.
function BannerMarquee({
  token,
  player,
  predictions,
  myRank,
  welcomeBack,
}: {
  token: string;
  player: Player;
  predictions: Prediction[];
  myRank: number | null;
  welcomeBack: { giftAmount: number; awayHours: number } | null;
}) {
  const { t } = useLang();
  const [data, setData] = useState<any | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  // Each player's own scroll speed, remembered in their browser (no DB).
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  // Rotates the gold Match-of-the-Day bar when several matches are featured.
  const [featIdx, setFeatIdx] = useState(0);

  useEffect(() => {
    const s = safeGet("spg_banner_speed");
    if (s === "slow" || s === "normal" || s === "fast") setSpeed(s);
  }, []);
  function cycleSpeed() {
    const order = ["slow", "normal", "fast"] as const;
    const next = order[(order.indexOf(speed) + 1) % order.length];
    setSpeed(next);
    safeSet("spg_banner_speed", next);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/banner?tz=${encodeURIComponent(clientTz())}&_=${Date.now()}`, {
        headers: authHeaders(token),
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    } catch {
      /* network blip — keep last */
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setFeatIdx((i) => i + 1), 4500);
    return () => clearInterval(id);
  }, []);

  if (!data || !data.show) return null;

  const messages = buildBannerMessages(t, data, player, predictions, myRank, welcomeBack);
  if (messages.length === 0 && !data.isAdmin) return null;

  const joined = messages.join(" • ");
  const base = Math.max(24, Math.round(joined.length * 0.28));
  const speedFactor = speed === "slow" ? 1.8 : speed === "fast" ? 0.55 : 1;
  const duration = `${Math.round(base * speedFactor)}s`;
  const speedIcon = speed === "slow" ? "🐢" : speed === "fast" ? "🐇" : "🚶";
  // The gold "pop" bar shows the event's featured match(es) while the event is on
  // (rotating if several), otherwise the auto Match of the Day.
  const goldRaw: any[] =
    data.event?.on && data.event.featuredMatches?.length
      ? data.event.featuredMatches
      : data.motd
        ? [data.motd]
        : [];
  // Never leave a finished game sitting in the gold bar: once a match ends, drop it
  // so the bar advances to the next live/upcoming featured game (or hides if none).
  const goldList = goldRaw.filter((m) => m && m.status !== "FINISHED" && m.status !== "AWARDED");
  const goldMatch = goldList.length ? goldList[featIdx % goldList.length] : null;
  const goldFromFeatured = !!(data.event?.on && data.event.featuredMatches?.length);
  const goldMult = goldFromFeatured ? fmtMult(goldMatch?.mult ?? data.event.mult) : "3";

  return (
    <div className="sticky top-0 z-40 w-full border-b border-white/10 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-700 text-white shadow-md">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3">
        {messages.length > 0 ? (
          // dir="ltr" keeps the scroll mechanics consistent in both languages;
          // each message uses dir="auto" so Hebrew text still renders right-to-left.
          <div className="flex-1 overflow-hidden py-1.5" dir="ltr">
            <div className="marquee-track text-sm font-semibold" style={{ animationDuration: duration }}>
              <span className="marquee-seg">
                {messages.map((m, i) => (
                  <span key={i} dir="auto" className="marquee-msg">
                    {m}
                  </span>
                ))}
              </span>
              <span className="marquee-seg" aria-hidden="true">
                {messages.map((m, i) => (
                  <span key={i} dir="auto" className="marquee-msg">
                    {m}
                  </span>
                ))}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 py-1.5 text-sm font-semibold text-blue-100">{t("admin.previewNote")}</div>
        )}
        {messages.length > 0 && (
          <button
            onClick={cycleSpeed}
            title={t("banner.speed", { s: t("banner.spd." + speed) })}
            aria-label={t("banner.speed", { s: t("banner.spd." + speed) })}
            className="shrink-0 rounded-md bg-white/15 px-2 py-0.5 text-sm"
          >
            {speedIcon}
          </button>
        )}
        {data.isAdmin && (
          <button
            onClick={() => setShowAdmin((s) => !s)}
            title={t("admin.title")}
            className="shrink-0 rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold"
          >
            ⚙️
          </button>
        )}
      </div>
      {goldMatch && (
        <button
          onClick={() => scrollToId("matches")}
          className="motd-pop flex w-full items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-3 py-1.5 text-center text-sm font-extrabold text-gray-900"
        >
          <span dir="auto">
            {motdLine(t, goldMatch)}
            {goldMatch.status !== "FINISHED" ? ` — ${t("banner.pays", { mult: goldMult })}` : ""}
          </span>
        </button>
      )}
      {data.isAdmin && showAdmin && (
        <EventAdmin token={token} initial={data.config} matches={data.adminMatches ?? []} onSaved={load} />
      )}
      <style>{`
        .marquee-track { display:inline-flex; white-space:nowrap; will-change:transform; animation-name:spg-marquee; animation-timing-function:linear; animation-iteration-count:infinite; }
        .marquee-track:hover { animation-play-state:paused; }
        .marquee-seg { display:inline-flex; }
        .marquee-msg::after { content:"•"; margin:0 0.9rem; opacity:0.5; }
        @keyframes spg-marquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        .motd-pop { animation: motd-pulse 1.8s ease-in-out infinite; }
        @keyframes motd-pulse { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.12); } }
      `}</style>
    </div>
  );
}

// Flashing "you can use the Comeback Wheel" notice, pinned under the ticker. It sits in
// normal flow (pushes content down, hides nothing). The player can collapse it to a small
// pill and reopen it; rising back out of the bottom 30% (show=false) removes it entirely
// and resets it, so a later drop shows the full banner again. Admins see it as a preview.
function ComebackAlert({ show, isPreview }: { show: boolean; isPreview: boolean }) {
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(safeGet("spg_comeback_collapsed") === "1");
  }, []);
  useEffect(() => {
    if (!show) safeSet("spg_comeback_collapsed", "0"); // reset when no longer eligible
  }, [show]);

  if (!show) return null;

  const collapse = () => {
    setCollapsed(true);
    safeSet("spg_comeback_collapsed", "1");
  };
  const expand = () => {
    setCollapsed(false);
    safeSet("spg_comeback_collapsed", "0");
  };

  const css = `
    .cb-flash { animation: cb-flash 1.15s ease-in-out infinite; }
    @keyframes cb-flash {
      0%,100% { background-color:#15803d; box-shadow:0 0 0 0 rgba(34,197,94,0); }
      50% { background-color:#22c55e; box-shadow:0 0 22px 5px rgba(34,197,94,0.6); }
    }
    .cb-pulse { animation: cb-pulse 1.3s ease-in-out infinite; }
    @keyframes cb-pulse { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.28); } }
  `;

  if (collapsed) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-2">
        <button
          onClick={expand}
          className="cb-pulse inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-sm font-bold text-white shadow"
        >
          {t("comebackAlert.pill")} ▸
        </button>
        <style>{css}</style>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-2">
      <div className="cb-flash relative overflow-hidden rounded-xl border border-green-200/40 px-4 py-3 text-white shadow-lg" dir="auto">
        <button
          onClick={collapse}
          aria-label={t("comebackAlert.close")}
          className="absolute right-2 top-2 rounded-full bg-black/20 px-2 py-0.5 text-xs font-bold hover:bg-black/30"
        >
          ✕
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="pr-6">
            <p className="text-base font-extrabold">
              {t("comebackAlert.title")}
              {isPreview && (
                <span className="ml-2 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {t("comebackAlert.preview")}
                </span>
              )}
            </p>
            <p className="text-sm text-white/95">{t("comebackAlert.body")}</p>
          </div>
          <button
            onClick={() => scrollToId("minigames")}
            className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-extrabold text-green-700 shadow hover:bg-green-50"
          >
            {t("comebackAlert.cta")}
          </button>
        </div>
        <style>{css}</style>
      </div>
    </div>
  );
}

function Game({
  token,
  player,
  predictions,
  canBailout,
  spinsLeft,
  nextSpinFree,
  showComeback,
  showComebackAlert,
  showRegularWheel,
  mustSpinToBet,
  comebackSpinsLeft,
  canPenalty,
  canLendToday,
  loansOwed,
  loansOwedToMe,
  leaderboard,
  myRank,
  welcomeBack,
  onRefresh,
  onSignOut,
}: {
  token: string;
  player: Player;
  predictions: Prediction[];
  canBailout: boolean;
  spinsLeft: number;
  nextSpinFree: boolean;
  showComeback: boolean;
  showComebackAlert: boolean;
  showRegularWheel: boolean;
  mustSpinToBet: boolean;
  comebackSpinsLeft: number;
  canPenalty: boolean;
  canLendToday: boolean;
  loansOwed: LoanRow[];
  loansOwedToMe: LoanRow[];
  leaderboard: LeaderRow[];
  myRank: number | null;
  welcomeBack: { giftAmount: number; awayHours: number } | null;
  onRefresh: () => void | Promise<void>;
  onSignOut: () => void;
}) {
  const { t } = useLang();
  const [matches, setMatches] = useState<Match[]>([]);
  const [motdId, setMotdId] = useState<number | null>(null);
  const [featuredIds, setFeaturedIds] = useState<number[]>([]);
  const [featuredMult, setFeaturedMult] = useState<number>(2.5);
  const [featuredMults, setFeaturedMults] = useState<Record<number, number>>({});
  const [comp, setComp] = useState("All");
  const [visible, setVisible] = useState(10);
  const [view, setView] = useState<"play" | "log" | "bracket">("play");
  const [showChanges, setShowChanges] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewPlayer, setViewPlayer] = useState<string | null>(null);
  const [seenVersion, setSeenVersion] = useState<string>(VERSION);
  // How many claimable challenges / badges are waiting, for the reminder dots.
  // Fetched here (not just inside the tab components) so the badge on the *other*
  // tab still shows while it's unmounted.
  const [claimCounts, setClaimCounts] = useState({ challenges: 0, badges: 0 });

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
    syncServerClock(data.serverNow);
    setMatches(data.matches ?? []);
    setMotdId(data.motdId ?? null);
    setFeaturedIds(data.featuredIds ?? []);
    setFeaturedMult(data.featuredMult ?? 2.5);
    setFeaturedMults(data.featuredMults ?? {});
  }, []);

  useEffect(() => {
    loadMatches();
    // Keep matches fresh (other players' picks). The leaderboard comes from
    // /api/me, which the parent polls every 60s.
    const id = setInterval(loadMatches, 60000);
    return () => clearInterval(id);
  }, [loadMatches]);

  // Count claimable challenges + badges so the reminder dots stay accurate even
  // while their tab is closed. Recomputed whenever the player (stats) changes
  // and after any claim (via refreshAll).
  const loadClaimable = useCallback(async () => {
    try {
      const [cr, ar] = await Promise.all([
        fetch("/api/challenges", { headers: authHeaders(token), cache: "no-store" }),
        fetch("/api/achievements", { headers: authHeaders(token), cache: "no-store" }),
      ]);
      const challenges = cr.ok
        ? ((await cr.json()).challenges ?? []).filter((c: any) => c.claimable).length
        : 0;
      const badges = ar.ok
        ? ((await ar.json()).achievements ?? []).filter((a: any) => a.claimable).length
        : 0;
      setClaimCounts({ challenges, badges });
    } catch {
      /* network blip — keep the last known counts */
    }
  }, [token]);

  useEffect(() => {
    loadClaimable();
  }, [loadClaimable, player]);

  // Reload the player (+leaderboard, which now rides along on /api/me) and the
  // matches together, so balances and pictures stay in sync after any action.
  const refreshAll = useCallback(() => {
    onRefresh();
    loadMatches();
    loadClaimable();
  }, [onRefresh, loadMatches, loadClaimable]);

  // Manual ↻ Refresh button: awaits the reload and shows a "Refreshing…" state
  // so it's clearly doing something even when nothing changed.
  const [refreshing, setRefreshing] = useState(false);
  async function manualRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([Promise.resolve(onRefresh()), loadMatches()]);
    } finally {
      setRefreshing(false);
    }
  }

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
    const res = await fetch("/api/me", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ tz: clientTz() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.added === "number" && data.added > 0) {
      celebrate(t("topup.done", { amount: data.added.toLocaleString() }));
    }
    onRefresh();
  }

  const [repayingId, setRepayingId] = useState<string | null>(null);
  async function repayLoan(loanId: string) {
    if (repayingId) return;
    setRepayingId(loanId);
    try {
      const res = await fetch("/api/loan/repay", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ loanId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        celebrate(t("loan.repaidToast", { amount: data.amount?.toLocaleString?.() ?? data.amount }));
        onRefresh();
      } else {
        alert(data.error ?? t("loan.errGeneric"));
      }
    } finally {
      setRepayingId(null);
    }
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

  // Reminder dots: count everything the player can act on right now.
  const freeSpinReady = nextSpinFree && spinsLeft > 0 ? 1 : 0;
  const penaltyReady = canPenalty ? 1 : 0;
  const bailoutReady = canBailout && player.coins <= LOW_COINS ? 1 : 0;
  const miniGamesReady = freeSpinReady + penaltyReady;
  const playBadge = claimCounts.challenges + miniGamesReady + bailoutReady;
  const logBadge = claimCounts.badges;

  // Coins locked in pending bets — shown under the balance so "9,000" reads as
  // "9,000 + 1,000 in play" rather than looking like you lost coins by betting.
  const inPlay = predictions.reduce((s, p) => (p.status === "PENDING" ? s + p.stake : s), 0);

  return (
    <>
      <BannerMarquee
        token={token}
        player={player}
        predictions={predictions}
        myRank={myRank}
        welcomeBack={welcomeBack}
      />
      <ComebackAlert show={showComebackAlert} isPreview={showComebackAlert && showRegularWheel} />
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
          {inPlay > 0 && (
            <p className="text-[11px] text-blue-100/60">{t("game.inPlay", { n: inPlay.toLocaleString() })}</p>
          )}
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

      {player.coins <= LOW_COINS && (
        <LowCoinsPanel canBailout={canBailout} onBailout={bailout} />
      )}

      {(loansOwed.length > 0 || loansOwedToMe.length > 0) && (
        <LoansPanel
          owed={loansOwed}
          owedToMe={loansOwedToMe}
          myCoins={player.coins}
          repayingId={repayingId}
          onRepay={repayLoan}
        />
      )}

      {/* Tabs — colour-coded (blue / green / gold). Active = gradient fill + soft
          glow; idle = tinted background + matching border. Road to Final gets a
          gold promo treatment and a NEW badge since it's the newest feature. */}
      <div className="mt-4 flex gap-2 rounded-xl bg-black/20 p-1.5">
        <button
          onClick={() => setView("play")}
          className={`relative flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
            view === "play"
              ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/40 ring-1 ring-blue-300/60"
              : "bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/30 hover:bg-blue-500/20"
          }`}
        >
          {t("game.tabPlay")}
          <NotifDot count={playBadge} />
        </button>
        <button
          onClick={() => setView("log")}
          className={`relative flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
            view === "log"
              ? "bg-gradient-to-b from-emerald-500 to-green-700 text-white shadow-lg shadow-emerald-500/40 ring-1 ring-emerald-300/60"
              : "bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/20"
          }`}
        >
          {t("game.tabLog")}
          <NotifDot count={logBadge} />
        </button>
        <button
          onClick={() => setView("bracket")}
          className={`relative flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
            view === "bracket"
              ? "bg-gradient-to-b from-amber-300 to-yellow-500 text-gray-900 shadow-lg shadow-amber-400/50 ring-1 ring-amber-200/80"
              : "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/50 hover:bg-amber-400/25"
          }`}
        >
          {t("game.tabBracket")}
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-wide text-white shadow ring-1 ring-white/30">
            {t("game.new")}
          </span>
        </button>
      </div>

      {/* When the Play dot is lit by unclaimed challenge rewards (not games left to
          play), spell that out so it doesn't read as "more mini-games". Taps through to
          the Daily Challenges section to claim. */}
      {claimCounts.challenges > 0 && (
        <button
          onClick={() => {
            setView("play");
            // Let the Play view mount (if coming from the Log tab) before scrolling.
            setTimeout(() => scrollToId("challenges"), 50);
          }}
          dir="auto"
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-amber-400/15 px-3 py-1.5 text-sm font-bold text-amber-200 ring-1 ring-amber-300/30 hover:bg-amber-400/25"
        >
          {t("game.goClaim")}
        </button>
      )}

      {view === "log" && (
        <MyLog
          predictions={predictions}
          player={player}
          token={token}
          onChange={refreshAll}
          badgeCount={logBadge}
        />
      )}

      {view === "bracket" && <RoadToFinal />}

      {view === "play" && (
        <>
      {/* Leaderboard */}
      <Section title={t("game.leaderboard")}>
        <div className="mb-2 flex justify-end">
          <button
            onClick={manualRefresh}
            disabled={refreshing}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100 disabled:opacity-60"
          >
            {refreshing ? t("game.refreshing") : t("game.refresh")}
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
                {i < 3 ? (
                  <span title={`#${i + 1}`} className="shrink-0">
                    {rankMedal(i + 1)}
                  </span>
                ) : (
                  tierEmoji(row.xp) && (
                    <span
                      title={`${t("tier." + levelInfo(row.xp ?? 0).tierKey)} · ${t("mylog.level", { n: levelInfo(row.xp ?? 0).level })}`}
                      className="shrink-0"
                    >
                      {tierEmoji(row.xp)}
                    </span>
                  )
                )}
                {isNewPlayer(row.created_at) && (
                  <span title={t("badge.new")} className="shrink-0">🌱</span>
                )}
              </span>
              <span className="shrink-0 text-right font-semibold text-yellow-300">
                🪙 {(row.netWorth ?? row.coins ?? 0).toLocaleString()}
                {(row.inPlay ?? 0) > 0 && (
                  <span className="block text-[10px] font-normal text-blue-100/60">
                    {t("game.inPlay", { n: (row.inPlay ?? 0).toLocaleString() })}
                  </span>
                )}
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
      <Section id="challenges" title={t("game.dailyChallenges")} badge={claimCounts.challenges}>
        <ChallengesSection token={token} onClaimed={refreshAll} />
      </Section>

      {/* Mini-games */}
      <Section id="minigames" title={t("game.miniGames")} badge={miniGamesReady}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Real players see exactly one wheel: the bottom slice gets the Comeback
              Wheel (once it's live), everyone else the regular wheel. Admins see BOTH,
              so they can preview the comeback wheel before flipping it live. */}
          {showComeback && (
            <SpinWheel
              token={token}
              wheel={COMEBACK_WHEEL}
              endpoint="/api/comeback-spin"
              title={t("spin.comebackTitle")}
              // Seeing BOTH wheels = admin preview (spins are a no-op demo); a real
              // eligible player only ever sees the comeback wheel.
              desc={showRegularWheel ? t("spin.comebackPreviewDesc") : t("spin.comebackDesc")}
              spinsLeft={comebackSpinsLeft}
              nextSpinFree={comebackSpinsLeft > 0}
              coins={player.coins}
              boost={player.boost_2x ?? 0}
              shields={player.streak_shield ?? 0}
              freeBets={player.free_bets ?? 0}
              onDone={refreshAll}
            />
          )}
          {showRegularWheel && (
            <SpinWheel
              token={token}
              spinsLeft={spinsLeft}
              nextSpinFree={nextSpinFree}
              coins={player.coins}
              boost={player.boost_2x ?? 0}
              shields={player.streak_shield ?? 0}
              freeBets={player.free_bets ?? 0}
              onDone={refreshAll}
            />
          )}
          <PenaltyShootout token={token} canPlay={canPenalty} onDone={refreshAll} />
        </div>
      </Section>

      {/* Matches */}
      <Section title={t("game.upcoming")}>
        {mustSpinToBet && (
          <button
            onClick={() => scrollToId("minigames")}
            className="mb-3 flex w-full items-center gap-3 rounded-xl bg-amber-500/15 px-4 py-3 text-left ring-1 ring-amber-400/40"
          >
            <span className="text-2xl">🎡</span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-amber-200">{t("gate.title")}</span>
              <span className="block text-xs text-amber-100/80">{t("gate.desc")}</span>
            </span>
            <span className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black">
              {t("gate.cta")}
            </span>
          </button>
        )}
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

            <div id="matches" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  token={token}
                  coins={player.coins}
                  myBets={predByMatch.get(m.id) ?? []}
                  isMotd={m.id === motdId}
                  isFeatured={featuredIds.includes(m.id)}
                  featuredMult={featuredMults[m.id] ?? featuredMult}
                  boost={player.boost_2x ?? 0}
                  freeBets={player.free_bets ?? 0}
                  mustSpin={mustSpinToBet}
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
        <PlayerLogModal
          username={viewPlayer}
          onClose={() => setViewPlayer(null)}
          token={token}
          myUsername={player.username}
          canLendToday={canLendToday}
          onLent={onRefresh}
        />
      )}
    </main>
    </>
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
  const [zoom, setZoom] = useState<string | null>(null);

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
    <>
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
          {isPhoto(avatar) ? (
            <button onClick={() => setZoom(avatar!)} title={t("photo.view")} className="shrink-0">
              <Avatar avatar={avatar} size={56} />
            </button>
          ) : (
            <Avatar avatar={avatar} size={56} />
          )}
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
    {zoom && <ImageViewer src={zoom} onClose={() => setZoom(null)} />}
    </>
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

function PlayerLogModal({
  username,
  onClose,
  token,
  myUsername,
  canLendToday,
  onLent,
}: {
  username: string;
  onClose: () => void;
  token?: string;
  myUsername?: string;
  canLendToday?: boolean;
  onLent?: () => void | Promise<void>;
}) {
  const { t, lang } = useLang();
  const [data, setData] = useState<{
    player: { username: string; avatar: string | null; coins: number; win_streak: number; hide_picks?: boolean; created_at?: string | null };
    predictions: Prediction[];
    wins: number;
    losses: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [lendAmount, setLendAmount] = useState("");
  const [lending, setLending] = useState(false);
  const [lendMsg, setLendMsg] = useState<string | null>(null);

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

  const canLend = !!token && !!myUsername && myUsername !== username;

  async function lendCoins() {
    if (!token || lending) return;
    const amount = Math.floor(Number(lendAmount));
    if (!Number.isFinite(amount) || amount < MIN_LOAN_AMOUNT) {
      setLendMsg(t("loan.tooSmall", { min: MIN_LOAN_AMOUNT }));
      return;
    }
    setLending(true);
    setLendMsg(null);
    try {
      const res = await fetch("/api/loan", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ toUsername: username, amount, tz: clientTz() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setLendMsg(t("loan.sent", { amount: amount.toLocaleString(), name: username }));
        setLendAmount("");
        celebrate(t("loan.sent", { amount: amount.toLocaleString(), name: username }));
        await onLent?.();
      } else {
        setLendMsg(d.error ?? t("loan.errGeneric"));
      }
    } catch {
      setLendMsg(t("loan.errGeneric"));
    } finally {
      setLending(false);
    }
  }

  return (
    <>
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
              {isPhoto(data.player.avatar) ? (
                <button onClick={() => setZoom(data.player.avatar!)} title={t("photo.view")} className="shrink-0">
                  <Avatar avatar={data.player.avatar} size={48} />
                </button>
              ) : (
                <Avatar avatar={data.player.avatar} size={48} />
              )}
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

            {canLend && (
              <div className="mt-4 rounded-lg bg-white/5 p-3">
                <p className="text-sm font-bold text-blue-100">{t("loan.lendTitle", { name: username })}</p>
                {canLendToday === false ? (
                  <p className="mt-1 text-xs text-blue-100/60">{t("loan.cooldown")}</p>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={MIN_LOAN_AMOUNT}
                      step={10}
                      value={lendAmount}
                      onChange={(e) => setLendAmount(e.target.value)}
                      placeholder={t("loan.amountPlaceholder")}
                      className="w-28 rounded-lg bg-white/10 px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={lendCoins}
                      disabled={lending}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {lending ? t("loan.sending") : t("loan.lendBtn")}
                    </button>
                  </div>
                )}
                {lendMsg && <p className="mt-2 text-xs text-blue-100/80">{lendMsg}</p>}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {data.predictions.length === 0 ? (
                <p className="text-sm text-blue-100/70">{t("playerLog.noBets")}</p>
              ) : (
                groupBetsByMatch(data.predictions).map((p) => {
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
                        {p.free_bet && <span className="text-purple-300"> 🎟️</span>}
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
    {zoom && <ImageViewer src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

/* ------------------------------ Changelog --------------------------------- */

function Changelog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
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
              <ul className="mt-1 list-disc space-y-1 pe-0 ps-5 text-sm text-blue-100/80">
                {r.changes.map((c, i) => (
                  <li key={i}>{lang === "he" ? c.he : c.en}</li>
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
  badgeCount = 0,
}: {
  predictions: Prediction[];
  player: Player;
  token: string;
  onChange: () => void;
  badgeCount?: number;
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
      <h2 className="mb-2 mt-6 flex items-center text-lg font-bold">
        {t("mylog.badges")}
        <NotifDot count={badgeCount} />
      </h2>
      <Achievements token={token} onClaimed={onChange} />

      <h2 className="mb-2 mt-6 text-lg font-bold">{t("mylog.history")}</h2>
      {settled.length === 0 ? (
        <Empty text={pending > 0 ? t("mylog.pendingEmpty") : t("mylog.noFinished")} />
      ) : (
        <div className="space-y-2">
          {groupBetsByMatch(settled).map((p) => {
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
  freeBets,
  onDone,
  wheel = WHEEL,
  endpoint = "/api/spin",
  title,
  desc,
}: {
  token: string;
  spinsLeft: number;
  nextSpinFree: boolean;
  coins: number;
  boost: number;
  shields: number;
  freeBets: number;
  onDone: () => void;
  wheel?: WheelSlice[];
  endpoint?: string;
  title?: string;
  desc?: string;
}) {
  const { t } = useLang();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinMs, setSpinMs] = useState(SPIN_MS); // varies per spin so none look alike
  const [result, setResult] = useState<WheelSlice | null>(null);

  const seg = 360 / wheel.length;
  const gradient = `conic-gradient(${wheel.map(
    (w, i) => `${w.color} ${i * seg}deg ${(i + 1) * seg}deg`
  ).join(", ")})`;

  const canPay = nextSpinFree || coins >= EXTRA_SPIN_COST;
  const canSpin = !spinning && spinsLeft > 0 && canPay;

  async function doSpin() {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);
    const res = await fetch(endpoint, {
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
    // Rotate forward so the middle of `index` ends under the top pointer. Vary BOTH
    // the number of whole turns and the duration each spin, so no two spins look or
    // feel identical (the landing still always matches the server's real result).
    const landing = (360 - (index * seg + seg / 2) + 360) % 360;
    const turns = 4 + Math.floor(Math.random() * 4); // 4–7 full turns
    const dur = Math.round(SPIN_MS * (turns / 5) * (0.9 + Math.random() * 0.25));
    setSpinMs(dur);
    // Ratchet clicks for the length of the spin (skipped if sound is muted).
    if (!isMuted()) spinRatchet(dur);
    setRotation((cur) => {
      const curMod = ((cur % 360) + 360) % 360;
      return cur + 360 * turns + ((landing - curMod + 360) % 360);
    });

    setTimeout(() => {
      const slice = data.slice as WheelSlice;
      setResult(slice);
      if (isWinningSlice(slice)) {
        celebrate(prizeText(t, slice));
        // Layer a brass fanfare over the cheer for the biggest wins: a triumphant
        // one for the jackpot, a short one for the big coin prizes (250 / 500).
        if (!isMuted()) {
          const tier = bigWinTier(slice);
          if (tier === "jackpot") winFanfareTriumph();
          else if (tier === "big") winFanfareShort();
        }
      } else {
        // Landed on "No win" — don't celebrate: a sad womp + a plain toast, no confetti.
        if (!isMuted()) loseWomp();
        toast(prizeText(t, slice));
      }
      setSpinning(false);
      onDone();
    }, dur);
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="font-bold">{title ?? t("spin.title")}</p>
      <p className="mt-1 text-xs text-blue-100/70">
        {desc ?? t("spin.desc", { cost: EXTRA_SPIN_COST, max: MAX_SPINS_PER_DAY })}
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
            transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.17,0.67,0.12,0.99)` : "none",
          }}
        >
          {wheel.map((w, i) => {
            // Place each label along its slice's centre line and rotate it so the
            // word runs radially (hub → rim). This keeps long labels like
            // "Free bet" / "up to 2K" inside their wedge instead of spilling over.
            const a = i * seg + seg / 2; // slice centre angle, clockwise from top
            const rad = (a * Math.PI) / 180;
            const d = 54; // distance from the hub to the label's centre
            const cx = 100 + d * Math.sin(rad);
            const cy = 100 - d * Math.cos(rad);
            return (
              <div
                key={i}
                className="pointer-events-none absolute flex items-center gap-1 whitespace-nowrap text-[10px] font-bold leading-none text-white drop-shadow"
                style={{
                  left: `${cx}px`,
                  top: `${cy}px`,
                  transform: `translate(-50%, -50%) rotate(${a - 90}deg)`,
                }}
              >
                <span>{sliceLabel(t, w)}</span>
                <span className="text-sm">{w.emoji}</span>
              </div>
            );
          })}
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
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-blue-100/80">
        <span>{t("spin.boosts")} <b>{boost}</b></span>
        <span>{t("spin.shields")} <b>{shields}</b></span>
        <span>{t("spin.freeBets")} <b>{freeBets}</b></span>
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
  // Running tally kept in refs so rapid taps (or a laggy phone) can't lose a goal
  // to React's async state batching — the count must be exact when we submit it.
  const shotsRef = useRef(0);
  const goalsRef = useRef(0);
  const doneRef = useRef(false);

  function start() {
    shotsRef.current = 0;
    goalsRef.current = 0;
    doneRef.current = false;
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
    if (!bar || !mark || doneRef.current) return;
    const b = bar.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    const frac = (m.left + m.width / 2 - b.left) / b.width; // 0..1
    const isGoal = frac >= 0.38 && frac <= 0.62;
    // Advance the authoritative counters via refs (immune to render timing),
    // then mirror them into state for the on-screen display.
    const newGoals = goalsRef.current + (isGoal ? 1 : 0);
    const newShots = shotsRef.current + 1;
    goalsRef.current = newGoals;
    shotsRef.current = newShots;
    setResult(isGoal ? t("penalty.goal") : t("penalty.saved"));
    setGoals(newGoals);
    setShots(newShots);

    // Stadium reaction: crowd roar on a goal, disappointed groan on a save/miss.
    if (!isMuted()) {
      if (isGoal) playCheer();
      else playGroan();
    }

    if (newShots >= 5) {
      doneRef.current = true;
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

function Section({
  title,
  children,
  id,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  badge?: number;
}) {
  return (
    <section id={id} className="mt-7 scroll-mt-4">
      <h2 className="mb-2 flex items-center text-lg font-bold">
        {title}
        <NotifDot count={badge ?? 0} />
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// A small red "you have N things waiting" pill. Renders nothing when count is 0,
// so callers can pass a count unconditionally.
function NotifDot({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={`${count} available`}
      className="mx-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold leading-none text-white"
    >
      {count}
    </span>
  );
}

// The "Low on coins? Here's how to get more" helper, shown when a player is at or
// below LOW_COINS. Surfaces every way to earn, with one-tap access to each.
function LowCoinsPanel({
  canBailout,
  onBailout,
}: {
  canBailout: boolean;
  onBailout: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="mt-4 rounded-xl bg-yellow-500/15 p-4 ring-1 ring-yellow-400/30">
      <p className="text-sm font-bold text-yellow-200">{t("lowcoins.title")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canBailout && (
          <button
            onClick={onBailout}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-900"
          >
            {t("lowcoins.topup")}
          </button>
        )}
        <button
          onClick={() => scrollToId("minigames")}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold"
        >
          {t("lowcoins.spin")}
        </button>
        <button
          onClick={() => scrollToId("minigames")}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold"
        >
          {t("lowcoins.penalty")}
        </button>
        <button
          onClick={() => scrollToId("challenges")}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold"
        >
          {t("lowcoins.challenges")}
        </button>
      </div>
      <p className="mt-3 text-xs text-blue-100/70">{t("lowcoins.loginHint")}</p>
      <p className="mt-1 text-xs text-blue-100/70">{t("lowcoins.cashbackHint")}</p>
    </div>
  );
}

// Outstanding coin loans: what I still owe (repay button, only enabled once I can
// actually afford it) and what's still owed to me (informational — repayment is
// never enforced, so this is just a reminder of who owes what).
function LoansPanel({
  owed,
  owedToMe,
  myCoins,
  repayingId,
  onRepay,
}: {
  owed: LoanRow[];
  owedToMe: LoanRow[];
  myCoins: number;
  repayingId: string | null;
  onRepay: (loanId: string) => void;
}) {
  const { t } = useLang();
  return (
    <div className="mt-4 rounded-xl bg-purple-500/15 p-4 ring-1 ring-purple-400/30">
      <p className="text-sm font-bold text-purple-200">{t("loan.panelTitle")}</p>
      {owed.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {owed.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{t("loan.oweLine", { amount: l.amount.toLocaleString(), name: l.username })}</span>
              <button
                onClick={() => onRepay(l.id)}
                disabled={repayingId === l.id || myCoins < l.amount}
                className="shrink-0 rounded-lg bg-purple-500 px-2.5 py-1 text-xs font-bold disabled:opacity-40"
              >
                {repayingId === l.id ? t("loan.repaying") : t("loan.repayBtn")}
              </button>
            </div>
          ))}
        </div>
      )}
      {owedToMe.length > 0 && (
        <div className={owed.length > 0 ? "mt-3 space-y-1 border-t border-white/10 pt-2" : "mt-2 space-y-1"}>
          {owedToMe.map((l) => (
            <p key={l.id} className="text-xs text-blue-100/70">
              {t("loan.owedToMeLine", { name: l.username, amount: l.amount.toLocaleString() })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-white/5 p-4 text-sm text-blue-100/70">{text}</p>;
}

/* ------------------------------ Shared bits ------------------------------- */

// ---------- Road to the Final: live World Cup knockout bracket (read-only) ----------
// Mirrors the event artwork — a two-sided draw fanning out from a centre trophy, flag
// circles for every team, gold connector rails, live scores. Horizontally scrollable
// so the whole bracket stays usable on a phone. All data is live from the feed; we
// never guess who advances (the feed fills the next round once fixtures are set).

// Circular flag/crest, with team initials as a graceful fallback.
function RtfCrest({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/20">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => ((e.currentTarget.style.display = "none"))}
        />
      ) : (
        <span className="text-[8px] font-bold text-blue-100/80">
          {name.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function RtfTeamRow({ team }: { team: BracketTeam | null }) {
  const { t } = useLang();
  if (!team) {
    return (
      <div className="rtf-team">
        <span className="inline-block h-5 w-5 shrink-0 rounded-full bg-white/5 ring-1 ring-white/10" />
        <span className="truncate text-blue-100/40">{t("rtf.tbd")}</span>
      </div>
    );
  }
  return (
    <div className={`rtf-team ${team.won ? "won" : ""}`} dir="auto">
      <RtfCrest url={team.crest} name={team.name} />
      <span className="max-w-[64px] truncate">{team.name}</span>
      {team.score != null && <span className="ml-auto tabular-nums text-amber-200">{team.score}</span>}
    </div>
  );
}

function RtfNode({ match }: { match: BracketMatch | null }) {
  if (!match) {
    return (
      <div className="rtf-node opacity-60">
        <RtfTeamRow team={null} />
        <RtfTeamRow team={null} />
      </div>
    );
  }
  return (
    <div className={`rtf-node ${match.status === "IN_PLAY" ? "live" : ""}`}>
      <RtfTeamRow team={match.home} />
      <RtfTeamRow team={match.away} />
    </div>
  );
}

// Round title for a column, by stage key.
function rtfRoundLabel(t: (k: string) => string, key: string): string {
  switch (key) {
    case "LAST_32":
      return t("rtf.r32");
    case "LAST_16":
      return t("rtf.r16");
    case "QUARTER_FINALS":
      return t("rtf.qf");
    case "SEMI_FINALS":
      return t("rtf.sf");
    case "FINAL":
      return t("rtf.final");
    default:
      return "";
  }
}

function RtfSide({
  rounds,
  side,
}: {
  rounds: Bracket["rounds"];
  side: "left" | "right";
}) {
  const { t } = useLang();
  return (
    <div className={`rtf-side ${side}`}>
      {rounds.map((r) => {
        const cells = side === "left" ? r.left : r.right;
        return (
          <div className="rtf-col" key={`${side}-${r.key}`}>
            <div className="rtf-col-label">{rtfRoundLabel(t, r.key)}</div>
            <div className="rtf-col-cells">
              {cells.map((m, i) => (
                <div className="rtf-cell" key={i}>
                  <RtfNode match={m} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoadToFinal() {
  const { t } = useLang();
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bracket", { cache: "no-store" });
      const data = await res.json();
      if (data?.bracket) setBracket(data.bracket as Bracket);
    } catch {
      /* leave whatever we have; the empty state covers a cold start */
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on open, then refresh live scores every minute while the tab is showing.
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // The champion is the winner of a finished Final.
  const champ =
    bracket?.final?.status === "FINISHED"
      ? bracket.final.home?.won
        ? bracket.final.home
        : bracket.final.away?.won
          ? bracket.final.away
          : null
      : null;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-b from-[#0d1b3a] to-[#0a1428] ring-1 ring-amber-300/20">
      <div className="px-4 pt-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300/70">
          {t("rtf.subtitle")}
        </div>
        <div className="text-xl font-black uppercase tracking-wide text-white">
          {t("rtf.title")}
        </div>
      </div>

      {loading && !bracket ? (
        <div className="px-4 py-10 text-center text-sm text-blue-100/70">{t("common.loading")}</div>
      ) : !bracket || !bracket.hasData ? (
        <div className="px-6 py-10 text-center text-sm text-blue-100/70">{t("rtf.empty")}</div>
      ) : (
        <>
          {/* The bracket is an inherently left→right structure: force LTR so it
              never mirrors/breaks in Hebrew (RTL). Team names stay dir="auto". */}
          <div className="rtf-scroll" dir="ltr">
            <div className="rtf-board">
              <RtfSide rounds={bracket.rounds} side="left" />

              {/* Centre: the Final + trophy + crowned champion. */}
              <div className="flex flex-col items-center justify-center gap-1 px-1">
                <div className="text-3xl drop-shadow-[0_0_8px_rgba(217,179,74,0.5)]">🏆</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-300/80">
                  {t("rtf.final")}
                </div>
                <div className="min-w-[84px]">
                  <RtfNode match={bracket.final} />
                </div>
                {champ && (
                  <div className="mt-0.5 max-w-[92px] truncate text-center text-[11px] font-bold text-amber-300" dir="auto">
                    👑 {champ.name}
                  </div>
                )}
                {bracket.thirdPlace && (
                  <div className="mt-2 w-[84px]">
                    <div className="text-center text-[8px] font-semibold uppercase tracking-wider text-blue-100/50">
                      {t("rtf.thirdPlace")}
                    </div>
                    <RtfNode match={bracket.thirdPlace} />
                  </div>
                )}
              </div>

              <RtfSide rounds={bracket.rounds} side="right" />
            </div>
          </div>
          <div className="px-4 pb-3 text-center text-[10px] text-blue-100/40">{t("rtf.scrollHint")}</div>
        </>
      )}
    </div>
  );
}

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

// True only for uploaded photos (data URLs) — emoji/fallback avatars don't zoom.
function isPhoto(avatar?: string | null): boolean {
  return !!avatar && avatar.startsWith("data:image/");
}

// Full-screen photo viewer (tap anywhere or ✕ to close). Sits above modals.
function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-lg font-bold text-white"
      >
        ✕
      </button>
    </div>
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
  freeBets = 0,
  isFeatured,
  featuredMult,
  isMotd,
  isKnockout,
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
  freeBets?: number; // available free bet tokens (0 = no free-bet option shown)
  isFeatured?: boolean; // Road-to-the-Final featured match (Winner pays the headline rate)
  featuredMult?: number; // that headline rate
  isMotd?: boolean; // Match of the Day (fixed bonus on top of base)
  isKnockout?: boolean; // knockout tie — Winner market has no Draw (ET + penalties decide)
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
  const [useFreeBet, setUseFreeBet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A free bet forces a fixed stake and can't be combined with a 2× boost.
  const effStake = useFreeBet ? FREE_BET_STAKE : stake;

  // The multiplier this bet would actually pay (featured rate / MOTD bonus included),
  // so the "if correct" preview matches what settlement pays — not just the base rate.
  const winMult = effectiveWinMult(type, isFeatured, featuredMult, isMotd);
  // The crowd-based underdog bonus can still push it higher — but not on a Featured
  // Winner (fixed headline rate) or an Exact score (no underdog market).
  const underdogApplies = type !== "EXACT" && !(isFeatured && type === "WINNER");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: any = { type, stake: effStake };
      if (type === "EXACT") {
        body.exactHome = Number(eh);
        body.exactAway = Number(ea);
      } else {
        body.pick = pick;
      }
      if (useFreeBet && freeBets > 0) body.freeBet = true;
      else if (useBoost && boost > 0) body.boosted = true;
      const res = await onSubmit(body);
      if (res?.error) setError(res.error);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    (useFreeBet || (stake > 0 && stake <= coins)) &&
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
          : // Knockout Winner market has no Draw — a tie is settled in extra time
            // and penalties, so only the two teams are offered. Half-time leader
            // keeps Draw (a knockout game can still be level at the break).
            type === "WINNER" && isKnockout
            ? [
                ["HOME", home],
                ["AWAY", away],
              ]
            : [
                ["HOME", home],
                ["DRAW", t("common.draw")],
                ["AWAY", away],
              ];
  const twoCols =
    type === "GOALS3" || type === "BTTS" || (type === "WINNER" && isKnockout);

  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold text-blue-100/80">{t(`prompt.${type}`)}</p>
      {type === "WINNER" && isKnockout && (
        <p className="mb-2 text-center text-[11px] text-blue-100/60">{t("form.knockout")}</p>
      )}
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
          value={effStake}
          disabled={useFreeBet}
          onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value))))}
          className="w-24 rounded-lg bg-white/95 px-2 py-1.5 text-center text-gray-900 disabled:opacity-60"
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

      {freeBets > 0 && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg bg-purple-400/10 px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={useFreeBet}
            onChange={(e) => {
              setUseFreeBet(e.target.checked);
              if (e.target.checked) setUseBoost(false);
            }}
            className="h-4 w-4 accent-purple-400"
          />
          <span className="font-semibold text-purple-200">
            {t("form.useFreeBet", { stake: FREE_BET_STAKE })}{" "}
            <span className="text-purple-200/70">{t("form.freeBetLeft", { n: freeBets })}</span>
          </span>
        </label>
      )}

      {boost > 0 && !useFreeBet && (
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

      {effStake > 0 && (
        <p className="mt-2 text-center text-sm font-semibold text-yellow-200">
          {t("form.ifCorrect", {
            n: Math.round(effStake * winMult * (useBoost && boost > 0 && !useFreeBet ? 2 : 1)).toLocaleString(),
          })}
          {useBoost && boost > 0 && !useFreeBet && <span className="text-amber-300"> ⚡2×</span>}
          {useFreeBet && <span className="text-purple-300"> 🎟️</span>}
          {underdogApplies && (
            <span className="block text-xs font-normal text-blue-100/60">{t("form.unpopular")}</span>
          )}
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
  isFeatured,
  featuredMult,
  isMotd,
  isKnockout,
  onChange,
}: {
  p: Prediction;
  home: string;
  away: string;
  token: string;
  coins: number;
  isFeatured?: boolean;
  featuredMult?: number;
  isMotd?: boolean;
  isKnockout?: boolean;
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
          isFeatured={isFeatured}
          featuredMult={featuredMult}
          isMotd={isMotd}
          isKnockout={isKnockout}
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
  isFeatured,
  featuredMult,
  boost,
  freeBets,
  mustSpin,
  onOpenPlayer,
  onPlaced,
}: {
  match: Match;
  token: string;
  coins: number;
  myBets: Prediction[];
  isMotd?: boolean;
  isFeatured?: boolean;
  featuredMult?: number;
  boost?: number;
  freeBets?: number;
  mustSpin?: boolean; // regular-wheel player still owes today's spins — block new bets
  onOpenPlayer?: (username: string) => void;
  onPlaced: () => void;
}) {
  const { t } = useLang();
  useTick(); // keep the close countdown + kickoff lock live (server clock)
  const kickoff = new Date(match.kickoff_at);
  const kickoffTime = kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // Trust the SERVER's clock, not the device's — a slow phone clock must never
  // make a kicked-off match look bettable (the server would reject it anyway).
  const minsLeft = Math.max(0, Math.round((kickoff.getTime() - serverNow()) / 60000));
  const closed = serverNow() >= kickoff.getTime();
  const knockout = isKnockoutStage(match.stage);
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
    <div
      className={`rounded-xl bg-white/5 p-4 ${
        isFeatured
          ? "ring-2 ring-amber-400 shadow-lg shadow-amber-400/40"
          : isMotd
            ? "ring-2 ring-yellow-400/70"
            : ""
      }`}
    >
      <div className="flex items-center justify-between text-xs text-blue-100/60">
        <span>{match.competition}</span>
        <span>
          {kickoff.toLocaleDateString()}{" "}
          {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {isFeatured ? (
        <div className="mt-1 animate-pulse text-center text-sm font-extrabold text-amber-300">
          {t("card.featured", { mult: fmtMult(featuredMult ?? 2.5) })}
        </div>
      ) : isMotd ? (
        <div className="mt-1 text-center text-xs font-bold text-yellow-300">{t("card.motd")}</div>
      ) : null}
      <TeamLine
        home={match.home_team}
        away={match.away_team}
        homeCrest={match.home_crest}
        awayCrest={match.away_crest}
      />

      <p
        className={`mt-2 text-center text-xs font-semibold ${
          closed ? "text-red-300" : minsLeft <= 15 ? "text-amber-300" : "text-blue-100/55"
        }`}
      >
        {closed
          ? t("card.closedAt", { time: kickoffTime })
          : minsLeft <= 15
            ? t("card.lastCall", { n: minsLeft, time: kickoffTime })
            : t("card.closesAt", { time: kickoffTime })}
      </p>
      {!closed && <p className="mt-1 text-center text-xs text-blue-100/60">{t("card.tip")}</p>}

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
          {current.status === "PENDING" && !closed && (
            <BetEditor
              p={current}
              home={match.home_team}
              away={match.away_team}
              token={token}
              coins={coins}
              isFeatured={isFeatured}
              featuredMult={featuredMult}
              isMotd={isMotd}
              isKnockout={knockout}
              onChange={onPlaced}
            />
          )}
        </div>
      ) : closed ? (
        <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-center text-sm text-blue-100/70">
          {t("card.closedNotice")}
        </div>
      ) : mustSpin ? (
        <button
          onClick={() => scrollToId("minigames")}
          className="mt-3 w-full rounded-lg bg-amber-500/15 px-3 py-2.5 text-center text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40"
        >
          🎡 {t("gate.card")}
        </button>
      ) : (
        <div className="mt-3">
          <BetForm
            type={tab}
            home={match.home_team}
            away={match.away_team}
            coins={coins}
            boost={boost}
            freeBets={freeBets}
            isFeatured={isFeatured}
            featuredMult={featuredMult}
            isMotd={isMotd}
            isKnockout={knockout}
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
  // Knockout ties have no Draw market, so leave it out of the split entirely.
  const knockout = isKnockoutStage(match.stage);
  const total = s.home + (knockout ? 0 : s.draw) + s.away;
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
        {!knockout && <div className="bg-blue-300" style={{ width: `${pct(s.draw)}%` }} />}
        <div className="bg-sky-400" style={{ width: `${pct(s.away)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-blue-100/80">
        <span>🟨 {match.home_team} {pct(s.home)}%</span>
        {!knockout && <span>🟩 {t("common.draw")} {pct(s.draw)}%</span>}
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
                isKnockout={isKnockoutStage(m.stage)}
                onChange={onChange}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
