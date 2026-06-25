// "Road to the Final" event config — a tiny key/value control panel stored in the
// existing app_meta table (no new config table needed). The admin sets these; the
// banner reads them. Everything defaults to OFF/safe, so if the schema rows don't
// exist yet (or the read fails) the event simply stays dormant and nothing breaks.

import { supabase } from "./supabase";
import { pickFeaturedGlobal } from "./motd";

export type EventConfig = {
  bannerPublic: boolean; // false = only admins see the banner (preview mode)
  comebackLive: boolean; // false = the Comeback Wheel is admin-preview only (not live yet)
  eventOn: boolean; // false = no Road-to-the-Final lines / no featured multiplier
  eventName: string;
  featuredMult: number; // DEFAULT Winner multiplier — used by the auto-pick and any
  //                       featured game that doesn't set its own (see featuredMults)
  jackpot: number; // displayed jackpot amount (admin bumps it)
  featuredOverrides: number[]; // specific match ids to feature, or [] = auto-pick
  featuredMults: Record<number, number>; // per-match Winner × overrides (match id -> ×);
  //                                         a game not listed here uses featuredMult
};

export const EVENT_DEFAULTS: EventConfig = {
  bannerPublic: false,
  comebackLive: false,
  eventOn: false,
  eventName: "Road to the Final",
  featuredMult: 2.5,
  jackpot: 5000,
  featuredOverrides: [],
  featuredMults: {},
};

// app_meta keys backing each field.
const K = {
  bannerPublic: "banner_public",
  comebackLive: "comeback_live",
  eventOn: "event_on",
  eventName: "event_name",
  featuredMult: "featured_mult",
  jackpot: "jackpot_amount",
  featuredOverride: "featured_override",
  featuredMults: "featured_mults",
} as const;

export async function getEventConfig(): Promise<EventConfig> {
  try {
    const { data } = await supabase
      .from("app_meta")
      .select("key, value")
      .in("key", Object.values(K));
    const m = new Map((data ?? []).map((r: any) => [r.key, r.value]));
    const num = (v: any, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) && v != null && v !== "" ? n : d;
    };
    const override = m.get(K.featuredOverride);
    const featuredOverrides = override
      ? String(override)
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((x) => Number.isFinite(x))
      : [];

    // Per-match multipliers (JSON map of match id -> ×). Corrupt or out-of-range
    // entries are dropped so a bad value can never poison the payout math.
    const featuredMults: Record<number, number> = {};
    const rawMults = m.get(K.featuredMults);
    if (rawMults) {
      try {
        const obj = JSON.parse(String(rawMults));
        if (obj && typeof obj === "object") {
          for (const [k, v] of Object.entries(obj)) {
            const id = Number(k);
            const mv = Number(v);
            if (Number.isInteger(id) && Number.isFinite(mv) && mv >= 1 && mv <= 10) {
              featuredMults[id] = Math.round(mv * 100) / 100;
            }
          }
        }
      } catch {
        /* corrupt map -> treat as none */
      }
    }

    return {
      bannerPublic: m.get(K.bannerPublic) === "true",
      comebackLive: m.get(K.comebackLive) === "true",
      eventOn: m.get(K.eventOn) === "true",
      eventName: (m.get(K.eventName) as string) || EVENT_DEFAULTS.eventName,
      featuredMult: num(m.get(K.featuredMult), EVENT_DEFAULTS.featuredMult),
      jackpot: num(m.get(K.jackpot), EVENT_DEFAULTS.jackpot),
      featuredOverrides,
      featuredMults,
    };
  } catch {
    return { ...EVENT_DEFAULTS };
  }
}

// Admin write: upsert only the provided fields into app_meta.
export async function setEventConfig(updates: Partial<EventConfig>): Promise<void> {
  const rows: { key: string; value: string; updated_at: string }[] = [];
  const now = new Date().toISOString();
  const push = (key: string, value: string) => rows.push({ key, value, updated_at: now });

  if (updates.bannerPublic !== undefined) push(K.bannerPublic, String(updates.bannerPublic));
  if (updates.comebackLive !== undefined) push(K.comebackLive, String(updates.comebackLive));
  if (updates.eventOn !== undefined) push(K.eventOn, String(updates.eventOn));
  if (updates.eventName !== undefined) push(K.eventName, updates.eventName);
  if (updates.featuredMult !== undefined) push(K.featuredMult, String(updates.featuredMult));
  if (updates.jackpot !== undefined) push(K.jackpot, String(updates.jackpot));
  if (updates.featuredOverrides !== undefined) {
    push(K.featuredOverride, (updates.featuredOverrides ?? []).join(","));
  }
  if (updates.featuredMults !== undefined) {
    push(K.featuredMults, JSON.stringify(updates.featuredMults ?? {}));
  }
  if (rows.length === 0) return;
  await supabase.from("app_meta").upsert(rows, { onConflict: "key" });
}

// The effective Winner multiplier for one featured match: its own per-match override
// if the admin set one, otherwise the event's default featuredMult. Shared by the
// bonus math and the banner/card display so a featured game always pays its shown ×.
export function featuredMultFor(cfg: EventConfig, matchId: number): number {
  const m = cfg.featuredMults?.[matchId];
  return typeof m === "number" && Number.isFinite(m) && m >= 1 ? m : cfg.featuredMult;
}

// The current featured match ids: the admin's picks if any, else the single
// global auto-pick (biggest upcoming). Returns [] if nothing's upcoming.
export async function getFeaturedMatchIds(cfg?: EventConfig): Promise<number[]> {
  const c = cfg ?? (await getEventConfig());
  if (c.featuredOverrides.length) return c.featuredOverrides;
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("matches")
    .select("id, competition, kickoff_at")
    .gte("kickoff_at", since)
    .order("kickoff_at", { ascending: true })
    .limit(200);
  const id = pickFeaturedGlobal((data ?? []) as any);
  return id ? [id] : [];
}
