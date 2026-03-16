import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTonBalance, getTonPrice, executeMcpAction } from "@/lib/ton";
import { Rule, User, ScheduleTrigger, PriceTrigger, BalanceTrigger } from "@/types";
import { bot, decryptMnemonic } from "@/lib/bot";
import { sendWeeklyReports } from "@/lib/weekly-report";
import cronParser from "cron-parser";

export async function GET(req: NextRequest) {
  // Protect this endpoint — only Vercel cron or your server should call it
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
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
    // Fetch all active rules
    const { data: rules, error } = await supabaseAdmin
      .from("rules")
      .select("*, users!inner(wallet_address, wallet_mnemonic_enc)")
      .eq("status", "active");

    if (error) throw error;
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

        // Execute the action
        const mnemonic = decryptMnemonic(rule.users.wallet_mnemonic_enc);

        const execResult = await executeMcpAction(mnemonic, rule.action);

        // Log the execution
        await supabaseAdmin.from("execution_logs").insert({
          rule_id: rule.id,
          user_id: rule.user_id,
          status: execResult.success ? "success" : "failed",
          tx_hash: execResult.txHash ?? null,
          error_message: execResult.error ?? null,
          executed_at: new Date().toISOString(),
        });

        // Fail-safe logic
        const updateData: any = {
          run_count: rule.run_count + 1,
          last_run_at: new Date().toISOString(),
          next_run_at: computeNextRun(rule),
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

        await supabaseAdmin
          .from("rules")
          .update(updateData)
          .eq("id", rule.id);

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
    case "schedule": {
      if (rule.next_run_at) {
        return new Date(rule.next_run_at).getTime() <= Date.now();
      }
      const t = trigger as ScheduleTrigger;
      return isCronDue(t.cron);
    }

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

/**
 * Simplified cron check — checks if the current minute matches the cron expression.
 * For production, replace with a proper library like `cron-parser` or `cronstrue`.
 */
function isCronDue(cron: string): boolean {
  const now = new Date();
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(" ");

  const match = (field: string, value: number) => {
    if (field === "*") return true;
    return parseInt(field, 10) === value;
  };

  return (
    match(minute, now.getUTCMinutes()) &&
    match(hour, now.getUTCHours()) &&
    match(dayOfMonth, now.getUTCDate()) &&
    match(month, now.getUTCMonth() + 1) &&
    match(dayOfWeek, now.getUTCDay())
  );
}

// ── Next Run Computation ──────────────────────────────────────────────────────

function computeNextRun(rule: Rule): string | null {
  // Price/balance triggers are continuous — they check every run
  if (rule.trigger.type !== "schedule") return new Date().toISOString();

  // For schedule triggers, use cron-parser for accurate next run time
  try {
    const t = rule.trigger as ScheduleTrigger;
    const interval = cronParser.parse(t.cron);
    return interval.next().toISOString();
  } catch (err) {
    console.error("Cron parse error", err);
    // fallback
    const next = new Date();
    next.setMinutes(next.getMinutes() + 1);
    return next.toISOString();
  }
}

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
        const explorer =
          process.env.TON_NETWORK === "testnet"
            ? "https://testnet.tonscan.org/tx"
            : "https://tonscan.org/tx";
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
