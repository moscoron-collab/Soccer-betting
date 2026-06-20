import { NextResponse } from "next/server";
import { fetchMatches } from "@/lib/footballData";
import { upsertMatches, settleAll } from "@/lib/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// football-data calls are slow (rate-limited), so allow a long run on Vercel.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-sync-secret");
  const url = new URL(req.url);
  const query = url.searchParams.get("secret");
  return header === secret || query === secret;
}

async function runSync() {
  // 1) Pull recent + upcoming matches across all tracked competitions and upsert.
  const fdMatches = await fetchMatches(3, 10);
  const upserted = await upsertMatches(fdMatches);

  // 2) Settle everything that's now ready (predictions, crowd guesses, parlays).
  const counts = await settleAll();

  return { upserted, ...counts };
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[sync] error", err);
    return NextResponse.json({ error: err?.message ?? "sync failed" }, { status: 500 });
  }
}

// Allow GET too so it can be triggered from a browser/cron with ?secret=...
export async function GET(req: Request) {
  return POST(req);
}
