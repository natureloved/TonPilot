import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { bot } from "@/lib/bot";

// Grammy webhook handler for Next.js
const handleUpdate = webhookCallback(bot, "std/http");

export async function POST(req: NextRequest) {
  // Validate the secret token Telegram sends with each webhook request
  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await handleUpdate(req);
  } catch (err) {
    console.error("[bot webhook] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
