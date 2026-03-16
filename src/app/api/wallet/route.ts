import { NextRequest, NextResponse } from "next/server";
import { getTonBalance } from "@/lib/ton";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const balance = await getTonBalance(address);
    return NextResponse.json({ balance });
  } catch (err) {
    console.error("[api/wallet] error:", err);
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
