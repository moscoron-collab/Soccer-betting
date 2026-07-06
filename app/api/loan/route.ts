import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest, escapeLike } from "@/lib/auth";
import { MIN_LOAN_AMOUNT } from "@/lib/loan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/loan  { toUsername, amount, tz }
// Lends coins straight from the caller's balance to another player. One loan
// sent per player per local day; a lender can never lend more than they have.
// Repayment is manual (see /api/loan/repay) — never enforced automatically.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const toUsername = String(body?.toUsername ?? "").trim();
  const amount = Math.floor(Number(body?.amount));

  if (!toUsername) {
    return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < MIN_LOAN_AMOUNT) {
    return NextResponse.json({ error: `Loans start at 🪙${MIN_LOAN_AMOUNT}.` }, { status: 400 });
  }
  if (player.coins < amount) {
    return NextResponse.json({ error: "You don't have enough coins to lend that much." }, { status: 400 });
  }

  const { data: borrower } = await supabase
    .from("players")
    .select("id, username")
    .ilike("username", escapeLike(toUsername))
    .maybeSingle();
  if (!borrower) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (borrower.id === player.id) {
    return NextResponse.json({ error: "You can't lend coins to yourself." }, { status: 400 });
  }

  // Everything validated — move the coins. No frequency limit: a player may lend
  // to anyone, any number of times, as long as they can cover it.
  await supabase.rpc("increment_coins", { p_player: player.id, p_amount: -amount });
  await supabase.rpc("increment_coins", { p_player: borrower.id, p_amount: amount });

  const { error: loanErr } = await supabase.from("loans").insert({
    lender_id: player.id,
    borrower_id: borrower.id,
    amount,
  });
  if (loanErr) {
    // Roll back the coin transfer so a broken loans table can't create free money.
    await supabase.rpc("increment_coins", { p_player: player.id, p_amount: amount });
    await supabase.rpc("increment_coins", { p_player: borrower.id, p_amount: -amount });
    return NextResponse.json({ error: "Could not send the loan. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, amount, toUsername: borrower.username });
}
