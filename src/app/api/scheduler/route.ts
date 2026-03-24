import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTonBalance, getTonPrice, executeMcpAction } from "@/lib/ton";
import { Rule, User, ScheduleTrigger, PriceTrigger, BalanceTrigger } from "@/types";
import { bot, computeNextRun } from "@/lib/bot";
import { sendWeeklyReports } from "@/lib/weekly-report";
import cronParser from "cron-parser";
import { decryptMnemonic } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  // Protect this endpoint — only Vercel cron or your server should call it
  const secretHeader = req.headers.get("x-cron-secret");
  const secretQuery = req.nextUrl.searchParams.get("secret");
  
  if (secretHeader !== process.env.CRON_SECRET && secretQuery !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { checked: 0, fired: 0, errors: 0 };

  // ── Weekly Report — fires every Monday at 08:00 UTC ──
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isReportHour = now.getUTCHours() === 8 && now.getUTCMinutes() === 0;
  if (isMonday && isReportHour) {
    await sendWeeklyReports();
  }

  try {
    const nowTime = new Date();
    // Add 5 second buffer for early cron triggers, and wide 15m window for delayed crons
    const runUntil = new Date(nowTime.getTime() + 5000);
    const runSince = new Date(nowTime.getTime() - 15 * 60000);

    // Fetch scheduled rules that are due
    const { data: scheduledRules, error: scheduleError } = await supabaseAdmin
      .from("rules")
      .select("*, users!inner(wallet_address, wallet_mnemonic_enc)")
      .eq("status", "active")
      .lte("next_run_at", runUntil.toISOString())
      .gte("next_run_at", runSince.toISOString());

    if (scheduleError) throw scheduleError;

    // Fetch condition rules (price, balance) that are always evaluated
    const { data: conditionRules, error: conditionError } = await supabaseAdmin
      .from("rules")
      .select("*, users!inner(wallet_address, wallet_mnemonic_enc)")
      .eq("status", "active")
      .in("trigger->>type", ["price_above", "price_below", "balance_below", "balance_above"]);

    if (conditionError) throw conditionError;

    const rulesMap = new Map();
    if (scheduledRules) scheduledRules.forEach(r => rulesMap.set(r.id, r));
    if (conditionRules) conditionRules.forEach(r => rulesMap.set(r.id, r));
    const rules = Array.from(rulesMap.values());

    if (!rules || rules.length === 0) {
      return NextResponse.json({ message: "No active rules", ...results });
    }

    results.checked = rules.length;

    // Get current TON price once (shared across all price trigger checks)
    const tonPrice = await getTonPrice();

    // Check each rule
    for (const ruleRow of rules) {
      try {
        const rule = ruleRow as Rule & {
          users: { wallet_address: string; wallet_mnemonic_enc: string };
        };

        const shouldFire = await checkTrigger(rule, tonPrice);
        if (!shouldFire) continue;

        // FIRST: immediately push next_run_at to future to prevent double-firing
        const nextRun = computeNextRun(rule.trigger);
        await supabaseAdmin
          .from("rules")
          .update({ next_run_at: nextRun })
          .eq("id", rule.id);

        // Execute the action
        const mnemonic = decryptMnemonic(rule.users.wallet_mnemonic_enc);

        const execResult = await executeMcpAction(mnemonic, rule.action);

        // Log the execution
        const { error: logError } = await supabaseAdmin.from("execution_logs").insert({
          rule_id: rule.id,
          user_id: rule.user_id,
          status: execResult.success ? "success" : "failed",
          tx_hash: execResult.txHash ?? null,
          error_message: execResult.error ?? null,
          executed_at: new Date().toISOString(),
        });

        if (logError) {
          console.error(`[scheduler] Failed to insert execution log for rule ${rule.id}:`, logError);
        }

        // Fail-safe logic
        const updateData: any = {
          run_count: rule.run_count + 1,
          last_run_at: new Date().toISOString(),
        };

        if (execResult.success) {
          updateData.fail_count = 0;
          const newStreak = (rule.streak_count ?? 0) + 1;
          const longestStreak = Math.max(newStreak, rule.longest_streak ?? 0);
          updateData.streak_count = newStreak;
          updateData.longest_streak = longestStreak;
          
          // Check for milestones
          const milestones = [3, 5, 10, 25, 50, 100];
          if (milestones.includes(newStreak)) {
            await bot.api.sendMessage(
              rule.user_id,
              buildMilestoneMessage(rule.name, newStreak),
              { parse_mode: "Markdown" }
            );
          }
        } else {
          updateData.streak_count = 0;
          const failCount = (rule.fail_count ?? 0) + 1;
          updateData.fail_count = failCount;

          if (failCount >= 3) {
            updateData.status = "paused";
            await bot.api.sendMessage(
              rule.user_id,
              `⚠️ *Rule auto-paused: ${rule.name}*\n\n` +
              `This rule failed 3 times in a row so I've paused it to protect your vault.\n\n` +
              `Use /rules to review and /pause ${rule.id.slice(0, 8)} to resume it.`,
              { parse_mode: "Markdown" }
            );
          }
        }

        const { error: updateError } = await supabaseAdmin
          .from("rules")
          .update(updateData)
          .eq("id", rule.id);

        if (updateError) {
          console.error(`[scheduler] Failed to update rule ${rule.id} (status/stats):`, updateError);
          console.log(`[scheduler] Attempting fallback update for critical next_run_at time...`);

          // Fallback update: only update critical timing fields to prevent infinite loops
          const fallbackData = {
            run_count: rule.run_count + 1,
            last_run_at: new Date().toISOString(),
            status: updateData.status ?? rule.status,
          };

          const { error: fallbackError } = await supabaseAdmin
            .from("rules")
            .update(fallbackData)
            .eq("id", rule.id);
            
          if (fallbackError) {
             console.error(`[scheduler] FATAL: Fallback update also failed for rule ${rule.id}:`, fallbackError);
          }
        }

        // Notify user via Telegram
        await sendExecutionNotification(rule, execResult);

        results.fired++;
      } catch (ruleErr) {
        console.error(`[scheduler] rule ${ruleRow.id} error:`, ruleErr);
        results.errors++;
      }
    }
  } catch (err) {
    console.error("[scheduler] fatal error:", err);
    return NextResponse.json({ error: "Scheduler failed" }, { status: 500 });
  }

  return NextResponse.json(results);
}

// ── Trigger Evaluation ────────────────────────────────────────────────────────

async function checkTrigger(rule: Rule & { users: any }, tonPrice: number): Promise<boolean> {
  const { trigger } = rule;

  switch (trigger.type) {
    case "schedule":
      return true; // already filtered by next_run_at query

    case "price_above": {
      const t = trigger as PriceTrigger;
      return tonPrice >= t.threshold;
    }

    case "price_below": {
      const t = trigger as PriceTrigger;
      return tonPrice <= t.threshold;
    }

    case "balance_below":
    case "balance_above": {
      const t = trigger as BalanceTrigger;
      const balance = await getTonBalance(rule.users.wallet_address);
      return trigger.type === "balance_below"
        ? balance < t.threshold
        : balance > t.threshold;
    }

    default:
      return false;
  }
}

// ── Next Run Computation ──────────────────────────────────────────────────────

// computeNextRun imported from bot.ts

// ── Telegram Notifications ────────────────────────────────────────────────────

async function sendExecutionNotification(
  rule: Rule & { users: any },
  result: { success: boolean; txHash?: string; error?: string }
) {
  try {
    if (result.success) {
      let message = `✅ *TonPilot executed: ${rule.name}*\n\n`;

      if (rule.action.type === "swap") {
        message += `Swapped ${rule.action.amount} ${rule.action.fromAsset} → ${rule.action.toAsset}\n`;
      } else if (rule.action.type === "send") {
        message += `Sent ${rule.action.amount} ${rule.action.asset} to \`${rule.action.toAddress.slice(0, 10)}...\`\n`;
      } else if (rule.action.type === "alert") {
        message = `🔔 *TonPilot Alert: ${rule.name}*\n\nYour alert condition was triggered.`;
      }

      if (result.txHash) {
        const isAddr = result.txHash.startsWith("U") || result.txHash.startsWith("E");
        const path = isAddr ? "address" : "tx";
        const explorer =
          process.env.TON_NETWORK === "testnet"
            ? `https://testnet.tonscan.org/${path}`
            : `https://tonscan.org/${path}`;
        message += `\n[View transaction](${explorer}/${result.txHash})`;
      }

      await bot.api.sendMessage(rule.user_id, message, { parse_mode: "Markdown" });
    } else {
      await bot.api.sendMessage(
        rule.user_id,
        `❌ *TonPilot: Rule failed* — "${rule.name}"\n\nError: ${result.error ?? "Unknown error"}\n\nI'll try again next cycle.`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (err) {
    console.error("[sendExecutionNotification] error:", err);
  }
}

function buildMilestoneMessage(ruleName: string, streak: number): string {
  const messages: Record<number, string> = {
    3:   "🔥 3-run streak on _{name}_! Your autopilot is warming up.",
    5:   "⚡ 5 consecutive runs on _{name}_. You're building a habit.",
    10:  "🏆 10-run streak on _{name}_! A full month of consistency.",
    25:  "🚀 25 runs on _{name}_. Most people quit before this point.",
    50:  "💎 50-run streak on _{name}_. Diamond hands, automated.",
    100: "🌕 100 runs on _{name}_. You are the autopilot.",
  };
  const template = messages[streak] ?? `🔥 ${streak}-run streak on _{name}_!`;
  return `✈️ *Milestone Unlocked!*\n\n` + 
         template.replace("{name}", ruleName) +
         `\n\n_Keep the rules running._ 💪`;
}
