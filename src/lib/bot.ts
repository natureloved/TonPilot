import { Bot, Context, InlineKeyboard } from "grammy";
import { parseIntent } from "@/lib/intent-parser";
import { supabaseAdmin } from "@/lib/supabase";
import { createAgenticWallet } from "@/lib/ton";
import { Rule, User } from "@/types";

// ── Bot Instance ─────────────────────────────────────────────────────────────

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// ── Helper: get or create user ───────────────────────────────────────────────

async function getOrCreateUser(ctx: Context): Promise<User | null> {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return null;

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", telegramId)
    .single();

  if (existing) return existing as User;

  // New user — create record (wallet created separately during onboarding)
  const { data: newUser, error } = await supabaseAdmin
    .from("users")
    .insert({
      id: telegramId,
      telegram_username: ctx.from?.username ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[getOrCreateUser] insert error:", error);
    return null;
  }

  return newUser as User;
}

// ── /start ───────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (!user) return;

  const firstName = ctx.from?.first_name ?? "there";

  if (user.wallet_address) {
    // Returning user
    await ctx.reply(
      `✈️ Welcome back to *TonPilot*, ${firstName}!\n\nYour autopilot vault is ready. Tell me what to do — or use the buttons below.`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenu(),
      }
    );
  } else {
    // New user — start onboarding
    await ctx.reply(
      `✈️ Welcome to *TonPilot*, ${firstName}.\n\nTonPilot automates your TON wallet 24/7 — swaps on a schedule, price alerts that act, recurring sends that never miss.\n\nYou set the rules. I fly the plane. Let's build your vault.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🚀 Create My Vault", "create_wallet"),
      }
    );
  }
});

// ── Wallet Creation ──────────────────────────────────────────────────────────

bot.callbackQuery("create_wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("⏳ Creating your vault on TON...");

  try {
    const { address, mnemonic } = await createAgenticWallet();
    const telegramId = ctx.from.id.toString();

    // Store the mnemonic encrypted in Supabase
    // TODO: replace with proper encryption (e.g. AES-256 with a KMS key)
    const mnemonicEncoded = Buffer.from(mnemonic.join(" ")).toString("base64");

    await supabaseAdmin
      .from("users")
      .update({
        wallet_address: address,
        wallet_mnemonic_enc: mnemonicEncoded,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", telegramId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    await ctx.reply(
      `✅ *Vault Created!*\n\n` +
        `Your TonPilot vault address:\n\`${address}\`\n\n` +
        `📌 *Fund your vault* by sending TON to this address from any wallet (Tonkeeper, MyTonWallet, etc).\n\n` +
        `Once funded, just tell me what to automate. For example:\n` +
        `• _"Swap 20 TON to USDT every Friday"_\n` +
        `• _"Alert me when TON hits $5"_\n` +
        `• _"Send 5 TON to UQBx... on the 1st of every month"_`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📊 Open Dashboard", "open_dashboard")
          .row()
          .text("💡 See examples", "show_examples"),
      }
    );
  } catch (err) {
    console.error("[create_wallet] error:", err);
    await ctx.reply("❌ Something went wrong creating your vault. Please try /start again.");
  }
});

// ── Dashboard Button ─────────────────────────────────────────────────────────

bot.callbackQuery("open_dashboard", async (ctx) => {
  await ctx.answerCallbackQuery();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  await ctx.reply("📊 Open your TonPilot dashboard:", {
    reply_markup: new InlineKeyboard().webApp(
      "Open Dashboard →",
      `${appUrl}/dashboard`
    ),
  });
});

// ── Examples ─────────────────────────────────────────────────────────────────

bot.callbackQuery("show_examples", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `💡 *Things you can say:*\n\n` +
      `*Scheduled swaps (DCA)*\n` +
      `• "Swap 20 TON to USDT every Friday at 9am"\n` +
      `• "Buy 10 TON worth of NOT every Monday"\n\n` +
      `*Price alerts & triggers*\n` +
      `• "Alert me when TON hits $5"\n` +
      `• "Swap all my TON to USDT if price drops below $2"\n\n` +
      `*Scheduled sends*\n` +
      `• "Send 5 TON to UQBx...f3d2 on the 1st of every month"\n\n` +
      `*Balance alerts*\n` +
      `• "Notify me when my vault balance drops below 50 TON"`,
    { parse_mode: "Markdown" }
  );
});

// ── /rules ───────────────────────────────────────────────────────────────────

bot.command("rules", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const { data: rules } = await supabaseAdmin
    .from("rules")
    .select("*")
    .eq("user_id", telegramId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (!rules || rules.length === 0) {
    await ctx.reply(
      "You have no active rules yet. Tell me what to automate!",
      { reply_markup: mainMenu() }
    );
    return;
  }

  const ruleList = (rules as Rule[])
    .map((r, i) => {
      const icon = r.action.type === "swap" ? "🔄" : r.action.type === "send" ? "📤" : "🔔";
      return `${icon} *${r.name}*\nID: \`${r.id.slice(0, 8)}\` · runs: ${r.run_count}`;
    })
    .join("\n\n");

  await ctx.reply(
    `📋 *Your Active Rules (${rules.length})*\n\n${ruleList}\n\nTo pause a rule: /pause <id>\nTo delete: /delete <id>`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().webApp(
        "Manage in Dashboard →",
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
      ),
    }
  );
});

// ── /wallet ──────────────────────────────────────────────────────────────────

bot.command("wallet", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("wallet_address")
    .eq("id", telegramId)
    .single();

  if (!user?.wallet_address) {
    await ctx.reply("No vault found. Use /start to create one.");
    return;
  }

  const { getTonBalance, getTonPrice } = await import("@/lib/ton");
  const [balance, price] = await Promise.all([
    getTonBalance(user.wallet_address),
    getTonPrice(),
  ]);

  const usdValue = (balance * price).toFixed(2);

  await ctx.reply(
    `💼 *Your Vault*\n\n` +
      `Address: \`${user.wallet_address}\`\n` +
      `Balance: *${balance.toFixed(2)} TON*\n` +
      `Value: ~$${usdValue} USD\n` +
      `TON Price: $${price.toFixed(4)}`,
    { parse_mode: "Markdown" }
  );
});

// ── /help ────────────────────────────────────────────────────────────────────

bot.command("help", async (ctx) => {
  await ctx.reply(
    `✈️ *TonPilot Commands*\n\n` +
      `/start — Set up or return to TonPilot\n` +
      `/wallet — Check your vault balance\n` +
      `/rules — See your active rules\n` +
      `/pause <id> — Pause a rule\n` +
      `/delete <id> — Delete a rule\n` +
      `/help — Show this message\n\n` +
      `Or just *tell me what to automate*!`,
    { parse_mode: "Markdown" }
  );
});

// ── Natural Language Handler (main magic) ────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  // Ignore commands
  if (text.startsWith("/")) return;

  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Check user has a wallet
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("wallet_address")
    .eq("id", telegramId)
    .single();

  if (!user?.wallet_address) {
    await ctx.reply(
      "You need a vault first! Use /start to set one up.",
    );
    return;
  }

  // Show typing indicator
  await ctx.replyWithChatAction("typing");

  // Parse the intent with Claude
  const parsed = await parseIntent(text);

  if (!parsed.success) {
    if (parsed.clarification) {
      await ctx.reply(`🤔 ${parsed.clarification}`);
    } else if (parsed.error === "not_a_rule") {
      await ctx.reply(
        `I can help you automate TON transactions! Try something like:\n• _"Swap 20 TON to USDT every Friday"_\n• _"Alert me when TON hits $5"_`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(`❌ ${parsed.error}`);
    }
    return;
  }

  if (!parsed.rule) return;

  const { name, trigger, action } = parsed.rule;

  // Build a human-readable confirmation
  const triggerDesc = formatTrigger(trigger);
  const actionDesc = formatAction(action);

  const keyboard = new InlineKeyboard()
    .text("✓ Activate", `confirm_rule:${encodeRulePayload({ name, trigger, action })}`)
    .text("✕ Cancel", "cancel_rule");

  await ctx.reply(
    `Got it — here's what I'll set up:\n\n` +
      `📋 *${name}*\n` +
      `⚡ When: ${triggerDesc}\n` +
      `🎯 Do: ${actionDesc}\n\n` +
      `Shall I activate this rule?`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ── Rule Confirmation ────────────────────────────────────────────────────────

bot.callbackQuery(/^confirm_rule:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from.id.toString();

  try {
    const payload = decodeRulePayload(ctx.match[1]);

    const { data: rule, error } = await supabaseAdmin
      .from("rules")
      .insert({
        user_id: telegramId,
        name: payload.name,
        trigger: payload.trigger,
        action: payload.action,
        status: "active",
        run_count: 0,
        next_run_at: computeNextRun(payload.trigger),
      })
      .select()
      .single();

    if (error) throw error;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    await ctx.editMessageText(
      `✅ *Rule activated!* "${payload.name}" is now live.\n\nI'll notify you every time it runs.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().webApp(
          "View in Dashboard →",
          `${appUrl}/dashboard`
        ),
      }
    );
  } catch (err) {
    console.error("[confirm_rule] error:", err);
    await ctx.editMessageText("❌ Failed to save rule. Please try again.");
  }
});

bot.callbackQuery("cancel_rule", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Rule cancelled. Tell me if you want to set something else up!");
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mainMenu() {
  return new InlineKeyboard()
    .text("📋 My Rules", "show_rules")
    .text("💼 My Wallet", "show_wallet")
    .row()
    .text("💡 Examples", "show_examples");
}

function formatTrigger(trigger: any): string {
  switch (trigger.type) {
    case "schedule":
      return `Scheduled (${trigger.cron}) UTC`;
    case "price_above":
      return `When ${trigger.asset} price > $${trigger.threshold}`;
    case "price_below":
      return `When ${trigger.asset} price < $${trigger.threshold}`;
    case "balance_below":
      return `When vault balance < ${trigger.threshold} TON`;
    case "balance_above":
      return `When vault balance > ${trigger.threshold} TON`;
    default:
      return "Unknown trigger";
  }
}

function formatAction(action: any): string {
  switch (action.type) {
    case "swap":
      return `Swap ${action.amount} ${action.fromAsset} → ${action.toAsset}`;
    case "send":
      return `Send ${action.amount} ${action.asset} to ${action.toAddress.slice(0, 8)}...`;
    case "alert":
      return `Send me an alert`;
    default:
      return "Unknown action";
  }
}

function encodeRulePayload(data: object): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeRulePayload(encoded: string): any {
  return JSON.parse(Buffer.from(encoded, "base64url").toString());
}

function computeNextRun(trigger: any): string | null {
  // For price/balance triggers, next_run is continuous (set to now)
  if (trigger.type !== "schedule") return new Date().toISOString();

  // For schedule triggers, compute from cron
  // We'll use a simple placeholder — the scheduler will correct this on first check
  return new Date().toISOString();
}
