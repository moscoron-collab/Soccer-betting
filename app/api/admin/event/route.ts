import { NextResponse } from "next/server";
import { getPlayerFromRequest } from "@/lib/auth";
import { getEventConfig, setEventConfig, type EventConfig } from "@/lib/event";

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
// Body: { bannerPublic?, eventOn?, eventName?, featuredMult?, jackpot?, featuredOverride? }
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
  if ("featuredOverride" in body) {
    if (body.featuredOverride === null || body.featuredOverride === "") {
      updates.featuredOverride = null;
    } else {
      const n = Number(body.featuredOverride);
      if (Number.isFinite(n)) updates.featuredOverride = n;
    }
  }

  await setEventConfig(updates);
  return NextResponse.json({ config: await getEventConfig() }, { headers: noStore });
}
