import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { executeMcpAction } from "@/lib/ton";

export async function POST(req: NextRequest) {
  const { userId, toAddress, amount } = await req.json();

  if (!userId || !toAddress || !amount) {
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
    type: "send",
    asset: "TON",
    amount: parseFloat(amount),
    toAddress,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error }, 
      { status: 500 }
    );
  }

  return NextResponse.json({ 
    success: true, 
    txHash: result.txHash 
  });
}
