import { NextResponse } from "next/server";
import { getPlayerFromRequest } from "@/lib/auth";
import { getEventConfig, setEventConfig, getFeaturedMatchIds, type EventConfig } from "@/lib/event";
import { supabase } from "@/lib/supabase";
import { baseMultiplier, MAX_BONUS } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };

// GET /api/admin/event -> current event config (admins only).
export async function GET(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (player?.is_admin !== true) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  return NextResponse.json({ config: await getEventConfig() }, { headers: noStore });
}

// POST /api/admin/event -> update any subset of the event config (admins only).
// Body: { bannerPublic?, eventOn?, eventName?, featuredMult?, jackpot?, featuredOverrides? }
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (player?.is_admin !== true) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Partial<EventConfig> = {};
  if ("bannerPublic" in body) updates.bannerPublic = body.bannerPublic === true;
  if ("eventOn" in body) updates.eventOn = body.eventOn === true;
  if (typeof body.eventName === "string" && body.eventName.trim()) {
    updates.eventName = body.eventName.trim().slice(0, 60);
  }
  if ("featuredMult" in body) {
    const n = Number(body.featuredMult);
    if (Number.isFinite(n) && n >= 1 && n <= 10) updates.featuredMult = Math.round(n * 100) / 100;
  }
  if ("jackpot" in body) {
    const n = Number(body.jackpot);
    if (Number.isFinite(n) && n >= 0 && n <= 10_000_000) updates.jackpot = Math.round(n);
  }
  if (Array.isArray(body.featuredOverrides)) {
    updates.featuredOverrides = body.featuredOverrides
      .map((x: any) => Number(x))
      .filter((x: number) => Number.isFinite(x));
  }

  await setEventConfig(updates);

  // Apply the featured boost to bets ALREADY placed on the featured match(es), so a
  // promo lifts everyone — not just people who bet after it was switched on. We only
  // ever RAISE a bet's locked-in multiplier (the `.lt` guard below), so no existing
  // bet ever loses value, and settlement keeps reading the same bonus_mult column.
  const cfg = await getEventConfig();
  if (cfg.eventOn) {
    const fids = await getFeaturedMatchIds(cfg);
    if (fids.length) {
      const featuredBonus = Math.min(
        MAX_BONUS,
        Math.round((cfg.featuredMult / baseMultiplier("WINNER")) * 100) / 100
      );
      await supabase
        .from("predictions")
        .update({ bonus_mult: featuredBonus })
        .in("match_id", fids)
        .eq("type", "WINNER")
        .eq("status", "PENDING")
        .lt("bonus_mult", featuredBonus);
    }
  }

  return NextResponse.json({ config: cfg }, { headers: noStore });
}
