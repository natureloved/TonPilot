import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log("Testing Rules update...");
  // fetch one rule
  const { data: rules } = await supabaseAdmin.from("rules").select("id").limit(1);
  if (rules && rules.length > 0) {
    const id = rules[0].id;
    const { error } = await supabaseAdmin.from("rules").update({ fail_count: 0, streak_count: 1, longest_streak: 1 }).eq("id", id);
    if (error) {
      console.error("Update with streak_count FAILED:", error.message);
    } else {
      console.log("Update with streak_count SUCCESS!");
    }
  } else {
    console.log("No rules to test update.");
  }
}

test();
