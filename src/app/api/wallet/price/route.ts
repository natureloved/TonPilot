import { NextResponse } from "next/server";
import { getTonPrice } from "@/lib/ton";

export async function GET() {
  try {
    const price = await getTonPrice();
    return NextResponse.json({ price });
  } catch (err) {
    console.error("[api/wallet/price] error:", err);
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
