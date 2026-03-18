import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTonBalance, getTonPrice, getJettonBalances } from "@/lib/ton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const tz = req.nextUrl.searchParams.get("tz");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    // 1. Fetch User Profile
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("wallet_address, onboarded_at")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const walletAddress = user.wallet_address;

    // 2. Fetch Balance, Price, Rules, and Logs in parallel
    const [balance, price, jettonsRes, rulesRes, logsRes] = await Promise.all([
      walletAddress ? getTonBalance(walletAddress) : Promise.resolve(0),
      getTonPrice(),
      walletAddress ? getJettonBalances(walletAddress) : Promise.resolve([]),
      supabaseAdmin
        .from("rules")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("execution_logs")
        .select("*, rules(name)")
        .eq("user_id", userId)
        .order("executed_at", { ascending: false })
        .limit(100)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        userId,
        walletAddress,
        balance,
        price,
        jettons: jettonsRes || [],
        rules: rulesRes.data || [],
        logs: logsRes.data || []
      }
    });

  } catch (err) {
    console.error("[api/user/sync] Sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
