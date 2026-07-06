import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPlayerFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/loan/repay  { loanId }
// The borrower pays back a specific outstanding loan, in full, whenever they
// choose — nothing forces this, it's just a button the borrower can press.
export async function POST(req: Request) {
  const player = await getPlayerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const loanId = String(body?.loanId ?? "").trim();
  if (!loanId) return NextResponse.json({ error: "Missing loan" }, { status: 400 });

  const { data: loan } = await supabase
    .from("loans")
    .select("id, lender_id, borrower_id, amount, repaid")
    .eq("id", loanId)
    .maybeSingle();
  if (!loan || loan.borrower_id !== player.id) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }
  if (loan.repaid) {
    return NextResponse.json({ error: "Already repaid" }, { status: 400 });
  }
  if (player.coins < loan.amount) {
    return NextResponse.json({ error: "You don't have enough coins to repay this yet." }, { status: 400 });
  }

  // Mark repaid first, guarded on repaid = false, so a double-click can't pay twice.
  const { data: updated, error: updErr } = await supabase
    .from("loans")
    .update({ repaid: true, repaid_at: new Date().toISOString() })
    .eq("id", loanId)
    .eq("repaid", false)
    .select("id")
    .maybeSingle();
  if (updErr || !updated) {
    return NextResponse.json({ error: "Already repaid" }, { status: 400 });
  }

  await supabase.rpc("increment_coins", { p_player: loan.borrower_id, p_amount: -loan.amount });
  await supabase.rpc("increment_coins", { p_player: loan.lender_id, p_amount: loan.amount });

  return NextResponse.json({ ok: true, amount: loan.amount });
}
