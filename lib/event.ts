// "Road to the Final" event config — a tiny key/value control panel stored in the
// existing app_meta table (no new config table needed). The admin sets these; the
// banner reads them. Everything defaults to OFF/safe, so if the schema rows don't
// exist yet (or the read fails) the event simply stays dormant and nothing breaks.

import { supabase } from "./supabase";
import { pickFeaturedGlobal } from "./motd";

export type EventConfig = {
  bannerPublic: boolean; // false = only admins see the banner (preview mode)
  eventOn: boolean; // false = no Road-to-the-Final lines / no featured multiplier
  eventName: string;
  featuredMult: number; // total payout multiplier on the featured match's Winner market
  jackpot: number; // displayed jackpot amount (admin bumps it)
  featuredOverride: number | null; // a specific match id, or null = auto-pick
};

export const EVENT_DEFAULTS: EventConfig = {
  bannerPublic: false,
  eventOn: false,
  eventName: "Road to the Final",
  featuredMult: 2.5,
  jackpot: 5000,
  featuredOverride: null,
};

// app_meta keys backing each field.
const K = {
  bannerPublic: "banner_public",
  eventOn: "event_on",
  eventName: "event_name",
  featuredMult: "featured_mult",
  jackpot: "jackpot_amount",
  featuredOverride: "featured_override",
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
    return {
      bannerPublic: m.get(K.bannerPublic) === "true",
      eventOn: m.get(K.eventOn) === "true",
      eventName: (m.get(K.eventName) as string) || EVENT_DEFAULTS.eventName,
      featuredMult: num(m.get(K.featuredMult), EVENT_DEFAULTS.featuredMult),
      jackpot: num(m.get(K.jackpot), EVENT_DEFAULTS.jackpot),
      featuredOverride: override ? Number(override) : null,
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
  if (updates.eventOn !== undefined) push(K.eventOn, String(updates.eventOn));
  if (updates.eventName !== undefined) push(K.eventName, updates.eventName);
  if (updates.featuredMult !== undefined) push(K.featuredMult, String(updates.featuredMult));
  if (updates.jackpot !== undefined) push(K.jackpot, String(updates.jackpot));
  if (updates.featuredOverride !== undefined) {
    push(K.featuredOverride, updates.featuredOverride == null ? "" : String(updates.featuredOverride));
  }
  if (rows.length === 0) return;
  await supabase.from("app_meta").upsert(rows, { onConflict: "key" });
}

// The current featured match id: the admin override if set, else the global auto-pick.
export async function getFeaturedMatchId(cfg?: EventConfig): Promise<number | null> {
  const c = cfg ?? (await getEventConfig());
  if (c.featuredOverride) return c.featuredOverride;
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("matches")
    .select("id, competition, kickoff_at")
    .gte("kickoff_at", since)
    .order("kickoff_at", { ascending: true })
    .limit(200);
  return pickFeaturedGlobal((data ?? []) as any);
}
