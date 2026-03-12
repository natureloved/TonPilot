import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Rule } from "@/types";

export async function GET(req: NextRequest) {
  // In a real mini-app, you would verify the Telegram Web App initData
  // For this hackathon/demo, we'll accept a userId query param or get the first user
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  try {
    let query = supabaseAdmin
      .from("rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: rules, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("[GET /api/rules] Error fetching rules:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, name, trigger, action } = body;

    // Basic validation
    if (!user_id || !name || !trigger || !action) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, name, trigger, action" },
        { status: 400 }
      );
    }

    // Insert new rule
    const { data: rule, error } = await supabaseAdmin
      .from("rules")
      .insert({
        user_id,
        name,
        trigger,
        action,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/rules] Error creating rule:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
