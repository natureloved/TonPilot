import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTonBalance, getTonPrice } from "@/lib/ton";
import { bot } from "@/lib/bot";
import { ExecutionLog, Rule } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserReportData {
  userId: string;
  walletAddress: string;
  username: string | null;
  rules: Rule[];
  logs: ExecutionLog[];
  balance: number;
  tonPrice: number;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function sendWeeklyReports() {
  console.log("[WeeklyReport] Starting...");

  const tonPrice = await getTonPrice();

  // Fetch all users who have been onboarded
  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id, telegram_username, wallet_address")
    .not("onboarded_at", "is", null)
    .not("wallet_address", "is", null);

  if (error || !users || users.length === 0) {
    console.log("[WeeklyReport] No users found or error:", error);
    return;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      // Fetch user's active rules
      const { data: rules } = await supabaseAdmin
        .from("rules")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active");

      // Fetch last 7 days of execution logs
      const { data: logs } = await supabaseAdmin
        .from("execution_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("executed_at", sevenDaysAgo.toISOString())
        .order("executed_at", { ascending: false });

      // Skip users with no activity and no rules — nothing to report
      if ((!rules || rules.length === 0) && (!logs || logs.length === 0)) {
        skipped++;
        continue;
      }

      const balance = await getTonBalance(user.wallet_address);

      const reportData: UserReportData = {
        userId: user.id,
        walletAddress: user.wallet_address,
        username: user.telegram_username,
        rules: (rules ?? []) as Rule[],
        logs: (logs ?? []) as ExecutionLog[],
        balance,
        tonPrice,
      };

      const message = buildReportMessage(reportData);
      await bot.api.sendMessage(user.id, message, { parse_mode: "Markdown" });
      sent++;

      // Small delay to avoid Telegram rate limits
      await sleep(300);
    } catch (err) {
      console.error(`[WeeklyReport] Failed for user ${user.id}:`, err);
    }
  }

  console.log(`[WeeklyReport] Done. Sent: ${sent}, Skipped: ${skipped}`);
}

// ── Report Message Builder ────────────────────────────────────────────────────

function buildReportMessage(data: UserReportData): string {
  const { rules, logs, balance, tonPrice, username } = data;

  const firstName = username ? `@${username}` : "Pilot";
  const usdValue = (balance * tonPrice).toFixed(2);

  // Execution stats
  const successLogs = logs.filter(l => l.status === "success");
  const failedLogs = logs.filter(l => l.status === "failed");
  const totalFired = logs.length;

  // Count by action type
  const swapLogs = successLogs.filter(l => {
    const rule = rules.find(r => r.id === l.rule_id);
    return rule?.action.type === "swap";
  });

  const sendLogs = successLogs.filter(l => {
    const rule = rules.find(r => r.id === l.rule_id);
    return rule?.action.type === "send";
  });

  const alertLogs = successLogs.filter(l => {
    const rule = rules.find(r => r.id === l.rule_id);
    return rule?.action.type === "alert";
  });

  // Health status
  const healthEmoji = failedLogs.length === 0
    ? "🟢"
    : failedLogs.length <= 1
    ? "🟡"
    : "🔴";

  const healthText = failedLogs.length === 0
    ? "All systems nominal"
    : failedLogs.length === 1
    ? "1 rule had an issue"
    : `${failedLogs.length} rules had issues`;

  // Next rule firing
  const nextRule = rules
    .filter(r => r.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0];

  const nextRuleText = nextRule
    ? `_${nextRule.name}_ · ${formatRelativeTime(new Date(nextRule.next_run_at!))}`
    : "No upcoming rules";

  // Build the message
  let message = `✈️ *Weekly Pilot Report*\n`;
  message += `Week of ${formatWeekRange()}\n`;
  message += `\n`;

  // Vault snapshot
  message += `💼 *Vault Snapshot*\n`;
  message += `Balance: *${balance.toFixed(2)} TON* (~$${usdValue})\n`;
  message += `TON Price: $${tonPrice.toFixed(4)}\n`;
  message += `\n`;

  // Autopilot activity
  if (totalFired > 0) {
    message += `⚡ *Autopilot Activity (7 days)*\n`;
    message += `Rules fired: *${totalFired}*\n`;
    if (swapLogs.length > 0) message += `Swaps executed: *${swapLogs.length}*\n`;
    if (sendLogs.length > 0) message += `Sends completed: *${sendLogs.length}*\n`;
    if (alertLogs.length > 0) message += `Alerts triggered: *${alertLogs.length}*\n`;
    message += `\n`;
  } else {
    message += `⚡ *Autopilot Activity (7 days)*\n`;
    message += `No rules fired this week.\n`;
    message += `\n`;
  }

  // Health status
  message += `${healthEmoji} *System Health*: ${healthText}\n`;
  if (failedLogs.length > 0) {
    message += `_Check /rules to review and re-enable any paused rules._\n`;
  }
  message += `\n`;

  // Active rules count
  message += `📋 *Active Rules*: ${rules.length}\n`;
  message += `⏭ *Next run*: ${nextRuleText}\n`;
  message += `\n`;

  // Motivational closer — varies based on activity
  message += getMotivationalClose(totalFired, rules.length);

  return message;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWeekRange(): string {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return `${fmt(start)} – ${fmt(end)}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "very soon";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 7) return `in ${diffDays} days`;
  return `in ${Math.ceil(diffDays / 7)} weeks`;
}

function getMotivationalClose(rulesFired: number, activeRules: number): string {
  if (activeRules === 0) {
    return `_Your vault is ready — set your first rule with /templates and let the autopilot fly._ ✈️`;
  }
  if (rulesFired === 0) {
    return `_Your autopilot is armed and watching. Conditions haven't triggered yet — it'll fire when the time is right._ 🎯`;
  }
  if (rulesFired >= 5) {
    return `_${rulesFired} executions this week. Your autopilot is flying at full altitude._ 🚀`;
  }
  return `_Consistency is how wealth is built. Your autopilot ran ${rulesFired} time${rulesFired > 1 ? "s" : ""} this week without you lifting a finger._ ✈️`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
