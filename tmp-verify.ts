import "dotenv/config";
import { supabaseAdmin } from "./src/lib/supabase-admin";

async function verifyLogs() {
  const { data: logs, error } = await supabaseAdmin
    .from("execution_logs")
    .select("*, rules(name)")
    .order("executed_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Failed to fetch logs:", error);
    return;
  }

  console.log("=== Recent Execution Logs ===");
  logs.forEach(log => {
    console.log(`[${log.executed_at}] ${log.status.toUpperCase()} | Rule: ${(log.rules as any)?.name || 'Direct'} | Error: ${log.error_message || 'None'}`);
  });
}

verifyLogs();
