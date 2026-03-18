import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { executeMcpAction } from "@/lib/ton";

export async function POST(req: NextRequest) {
  const { userId, fromAsset, toAsset, amount } = await req.json();

  if (!userId || !fromAsset || !toAsset || !amount) {
    return NextResponse.json(
      { error: "Missing required fields" }, 
      { status: 400 }
    );
  }

  // Fetch user mnemonic
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("wallet_mnemonic_enc")
    .eq("id", userId)
    .single();

  if (!user?.wallet_mnemonic_enc) {
    return NextResponse.json(
      { error: "Wallet not found" }, 
      { status: 404 }
    );
  }

  const mnemonic = Buffer.from(
    user.wallet_mnemonic_enc, "base64"
  ).toString("utf-8");

  const result = await executeMcpAction(mnemonic, {
    type: "swap",
    fromAsset,
    toAsset,
    amount: parseFloat(amount),
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error }, 
      { status: 500 }
    );
  }

  // Log successful swaps so they show up in the Dashboard Activity Feed!
  await supabaseAdmin.from("execution_logs").insert({
    user_id: userId,
    rule_id: null,
    status: "success",
    tx_hash: result.txHash ?? null,
    error_message: null,
    executed_at: new Date().toISOString()
  });

  return NextResponse.json({ 
    success: true, 
    txHash: result.txHash 
  });
}
