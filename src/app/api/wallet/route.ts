import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTonBalance, getTonPrice } from "@/lib/ton";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get user wallet from database
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (error || !user?.wallet_address) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 }
      );
    }

    // Fetch live balance and price
    const [balance, price] = await Promise.all([
      getTonBalance(user.wallet_address),
      getTonPrice(),
    ]);

    const usdValue = balance * price;

    return NextResponse.json({
      address: user.wallet_address,
      balance,
      price,
      usdValue,
    });
  } catch (err) {
    console.error("[GET /api/wallet] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
