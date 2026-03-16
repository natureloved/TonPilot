import crypto from "crypto";
import { Bot, Context, InlineKeyboard } from "grammy";
import { parseIntent } from "@/lib/intent-parser";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAgenticWallet } from "@/lib/ton";
import { Rule, User } from "@/types";

// ── Encryption Utils ─────────────────────────────────────────────────────────

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16;

function encryptMnemonic(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptMnemonic(text: string): string {
  if (!text.includes(":")) {
    return Buffer.from(text, "base64").toString();
  }
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

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

    await ctx.reply(
      `🔐 *Your Secret Recovery Phrase*\n\n` +
      `Write these 24 words down and store them somewhere safe. This is the only way to recover your vault if you ever lose access to Telegram.\n\n` +
      `||${mnemonic.join(" ")}||\n\n` +
      `⚠️ TonPilot will never show this again.`,
      { parse_mode: "Markdown" }
    );

    const mnemonicEncoded = encryptMnemonic(mnemonic.join(" "));

    await supabaseAdmin
      .from("users")
      .update({
        wallet_address: address,
        wallet_mnemonic_enc: mnemonicEncoded,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", telegramId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
    const baseUrl = appUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
    const dashboardUrl = `${baseUrl}/dashboard?uid=${telegramId}`;

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
          .webApp("📊 Open Dashboard", dashboardUrl)
          .row()
          .text("💡 See examples", "show_examples"),
      }
    );
  } catch (err) {
    console.error("[create_wallet] error:", err);
    await ctx.reply("❌ Something went wrong creating your vault. Please try /start again.");
  }
});

// ── Dashboard Command ──────────────────────────────────────────────────────

bot.command("dashboard", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
  const baseUrl = rawUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
  const dashboardUrl = `${baseUrl}/dashboard?uid=${telegramId}`;
  await ctx.reply("📊 Your *TonPilot Dashboard* is ready.\n\n_Tip: You can also use the bottom-left menu button for one-tap access anytime._", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().webApp(
      "Open Dashboard →",
      dashboardUrl
    ),
  });
});

bot.callbackQuery("open_dashboard", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from.id.toString();
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
  const baseUrl = rawUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
  const dashboardUrl = `${baseUrl}/dashboard?uid=${telegramId}`;
  await ctx.reply("📊 Open your TonPilot dashboard:", {
    reply_markup: new InlineKeyboard().webApp(
      "Open Dashboard →",
      dashboardUrl
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

bot.callbackQuery("show_rules", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const { data: rules } = await supabaseAdmin
    .from("rules")
    .select("*")
    .eq("user_id", telegramId)
    .eq("status", "active");

  if (!rules || rules.length === 0) {
    await ctx.reply("You have no active rules yet. Tell me what to automate!");
    return;
  }

  const ruleList = (rules as Rule[])
    .map(r => `• *${r.name}* (ID: \`${r.id.slice(0, 8)}\`)`)
    .join("\n");

  await ctx.reply(`📋 *Your Active Rules*\n\n${ruleList}\n\nUse /rules for full details.`, { parse_mode: "Markdown" });
});

bot.callbackQuery("show_wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
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


// ── /templates ───────────────────────────────────────────────────────────────

bot.command("templates", async (ctx) => {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
  const baseUrl = rawUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
  const templatesUrl = `${baseUrl}/dashboard/templates`;

  await ctx.reply(
    `⚡ *Quick Start Templates*\n\n` +
    `Don't want to type from scratch? Pick a template and customize it in seconds:\n\n` +
    `🔄 *Weekly DCA* — Swap TON on a schedule\n` +
    `🔔 *Price Alert* — Notify when TON hits a price\n` +
    `📉 *Buy the Dip* — Auto-buy when price drops\n` +
    `⚠️ *Low Balance Alert* — Never run out of vault funds\n` +
    `📤 *Monthly Send* — Recurring TON payment\n` +
    `🎯 *Take Profit* — Auto-swap when price pumps\n\n` +
    `Tap below to open the template picker 👇`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().webApp(
        "⚡ Pick a Template →",
        templatesUrl
      ),
    }
  );
});


// ── /pulse ──────────────────────────────────────────────────────────────────

bot.command("pulse", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  try {
    await ctx.replyWithChatAction("typing");

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
    
    // 1. Fetch balance & price in parallel
    const [balance, price] = await Promise.all([
      getTonBalance(user.wallet_address),
      getTonPrice(),
    ]);

    // 2. Fetch active rules count
    const { count } = await supabaseAdmin
      .from("rules")
      .select("*", { count: "exact", head: true })
      .eq("user_id", telegramId)
      .eq("status", "active");

    // 3. Fetch next upcoming rule
    const { data: nextRules } = await supabaseAdmin
      .from("rules")
      .select("name, next_run_at")
      .eq("user_id", telegramId)
      .eq("status", "active")
      .not("next_run_at", "is", null)
      .order("next_run_at", { ascending: true })
      .limit(1);

    const nextRule = nextRules?.[0];
    const nextRuleText = nextRule 
      ? `_${nextRule.name}_ · ${formatRelativeTime(nextRule.next_run_at!)}`
      : "No upcoming runs";

    const usdValue = (balance * price).toFixed(2);
    const currentTime = new Date().toUTCString();

    await ctx.reply(
      `📡 *Market Pulse*\n\n` +
        `💎 TON Price: *$${price.toFixed(4)}*\n` +
        `\n` +
        `💼 *Your Vault*\n` +
        `Balance: *${balance.toFixed(2)} TON* (~$${usdValue})\n` +
        `Active rules: *${count ?? 0}*\n` +
        `Next autopilot run: ${nextRuleText}\n\n` +
        `_Last updated: ${currentTime}_`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[pulse] command error:", err);
    await ctx.reply("❌ Failed to fetch pulse data. Please try again.");
  }
});

// ── /pause ──────────────────────────────────────────────────────────────────

bot.command("pause", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const match = ctx.match as string;
  if (!match) {
    await ctx.reply(
      "Usage: /pause <rule_id>\n" +
      "Find your rule IDs with /rules",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const shortId = match.trim().slice(0, 8);
  
  // Search for the rule
  const { data: rule } = await supabaseAdmin
    .from("rules")
    .select("id, name, status")
    .eq("user_id", telegramId)
    .filter("id", "ilike", `${shortId}%`)
    .single();

  if (!rule) {
    await ctx.reply("Rule not found. Use /rules to see your rule IDs.");
    return;
  }

  const newStatus = rule.status === "active" ? "paused" : "active";
  
  const { error } = await supabaseAdmin
    .from("rules")
    .update({ status: newStatus })
    .eq("id", rule.id);

  if (error) throw error;

  if (newStatus === "paused") {
    await ctx.reply(
      `⏸ *Rule paused: ${rule.name}*\n` +
      `Send /rules to see all your rules.`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(
      `▶️ *Rule resumed: ${rule.name}*\n` +
      `Your autopilot is back in the air.`,
      { parse_mode: "Markdown" }
    );
  }
});

// ── /delete ─────────────────────────────────────────────────────────────────

bot.command("delete", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const match = ctx.match as string;
  if (!match) {
    await ctx.reply(
      "Usage: /delete <rule_id>\n" +
      "Find your rule IDs with /rules",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const shortId = match.trim().slice(0, 8);

  const { data: rule } = await supabaseAdmin
    .from("rules")
    .select("id, name")
    .eq("user_id", telegramId)
    .filter("id", "ilike", `${shortId}%`)
    .single();

  if (!rule) {
    await ctx.reply("Rule not found. Use /rules to see your rule IDs.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("✓ Yes, delete it", `delete_confirm:${rule.id}`)
    .text("✕ Cancel", "delete_cancel");

  await ctx.reply(
    `⚠️ *Delete ${rule.name}?*\n` +
    `This cannot be undone.`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.callbackQuery(/^delete_confirm:(.+)$/, async (ctx) => {
  const ruleId = ctx.match[1];
  const telegramId = ctx.from?.id?.toString();

  const { error } = await supabaseAdmin
    .from("rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", telegramId);

  if (error) throw error;

  await ctx.editMessageText(
    "🗑 *Rule deleted.* Your other rules are still running.",
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("delete_cancel", async (ctx) => {
  await ctx.editMessageText(
    "Cancelled. Rule is still active.",
    { parse_mode: "Markdown" }
  );
});

// ── /history ────────────────────────────────────────────────────────────────

bot.command("history", async (ctx) => {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  const { data: logs } = await supabaseAdmin
    .from("execution_logs")
    .select("*, rules(name)")
    .eq("user_id", telegramId)
    .order("executed_at", { ascending: false })
    .limit(10);

  if (!logs || logs.length === 0) {
    await ctx.reply(
      "No executions yet. Your rules will appear here once they fire.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  let message = "📋 *Execution History*\n\n";

  for (const log of logs) {
    const icon = log.status === "success" ? "✅" : "❌";
    const ruleName = (log.rules as any)?.name || "Unknown Rule";
    const time = formatRelativeTime(log.executed_at);
    
    message += `${icon} ${ruleName} · ${time}\n`;
    if (log.tx_hash) {
      const explorer = process.env.TON_NETWORK === "testnet" ? "testnet.tonscan.org" : "tonscan.org";
      message += `↗ [${explorer}/tx/${log.tx_hash.slice(0, 8)}...](${explorer}/tx/${log.tx_hash})\n`;
    }
    message += "\n";
  }
  await ctx.reply(message, {
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true }
  });
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

  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
  const baseUrl = rawUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
  const dashboardUrl = `${baseUrl}/dashboard?uid=${telegramId}`;

  await ctx.reply(
    `📋 *Your Active Rules (${rules.length})*\n\n${ruleList}\n\nTo pause a rule: /pause <id>\nTo delete: /delete <id>`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().webApp(
        "Manage in Dashboard →",
        dashboardUrl
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

// ── /export ──────────────────────────────────────────────────────────────────

bot.command("export", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("⚠️ I understand, show my phrase", "confirm_export")
    .text("Cancel", "cancel_export");

  await ctx.reply(
    `🚨 *DANGER ZONE*\n\n` +
    `You are about to view your 24-word recovery phrase. Anyone with this phrase has full control over your vault and your funds.\n\n` +
    `• Ensure no one is looking at your screen.\n` +
    `• TonPilot support will NEVER ask for this.\n\n` +
    `Do you want to proceed?`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

bot.callbackQuery("confirm_export", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = ctx.from.id.toString();

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("wallet_mnemonic_enc")
    .eq("id", telegramId)
    .single();

  if (!user?.wallet_mnemonic_enc) {
    await ctx.editMessageText("No vault found. Use /start to create one.");
    return;
  }

  let mnemonicText = "";
  try {
    mnemonicText = decryptMnemonic(user.wallet_mnemonic_enc);
  } catch (err) {
    mnemonicText = "Error decrypting mnemonic.";
    console.error("[export] decrypt error:", err);
  }

  console.log(`[EXPORT] User ${telegramId} exported their seed phrase.`);

  await ctx.editMessageText(
    `🔐 *Your Secret Recovery Phrase*\n\n` +
    `||${mnemonicText}||\n\n` +
    `⚠️ Never share this with anyone. TonPilot support will NEVER ask for your seed phrase.`,
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("cancel_export", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Export cancelled. Your phrase remains safely hidden.");
});

// ── /faucet ──────────────────────────────────────────────────────────────────

bot.command("faucet", async (ctx) => {
  await ctx.reply(
    `🚰 *TON Testnet Faucet*\n\n` +
    `Need test TON to try TonPilot? Get free testnet ` +
    `TON in seconds:\n\n` +
    `1️⃣ Copy your vault address with /wallet\n` +
    `2️⃣ Open the faucet bot below\n` +
    `3️⃣ Paste your address and receive 2 TON instantly\n\n` +
    `_You can request more every few hours._`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .url("🚰 Open Faucet Bot", "https://t.me/testgiver_ton_bot")
        .row()
        .url("🔍 View on Tonscan", `https://testnet.tonscan.org`),
    }
  );
});

// ── /help ────────────────────────────────────────────────────────────────────

bot.command("help", async (ctx) => {
  await ctx.reply(
    `✈️ *TonPilot Commands*\n\n` +
      `/start — Set up or return to TonPilot\n` +
      `/pulse — Live vault and market snapshot\n` +
      `/wallet — Check your vault balance\n` +
      `/rules — See your active rules\n` +
      `/history — See your last 10 executions\n` +
      `/pause <id> — Pause or resume a rule\n` +
      `/delete <id> — Delete a rule\n` +
      `/templates — Browse quick start templates\n` +
      `/export — Securely export your seed phrase\n` +
      `/faucet — Get free testnet TON for testing\n` +
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

  try {
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

    // Save to pending_rules to avoid 64-byte callback limit
    const { data: pending, error: pendingErr } = await supabaseAdmin
      .from("pending_rules")
      .insert({
        user_id: telegramId,
        name: name,
        trigger: trigger,
        action: action,
      })
      .select()
      .single();

    if (pendingErr || !pending) {
      console.error("[Natural Language Handler] Pending rule error:", pendingErr);
      await ctx.reply("❌ Error preparing rule confirmation. Please try again.");
      return;
    }

    const pendingId = pending.id;

    const keyboard = new InlineKeyboard()
      .text("✓ Activate", `confirm_rule:${pendingId}`)
      .text("✕ Cancel", `delete_pending:${pendingId}`);

    await ctx.reply(
      `Got it — here's what I'll set up:\n\n` +
        `📋 <b>${name}</b>\n` +
        `⚡ When: ${triggerDesc}\n` +
        `🌍 Timezone: UTC (add your offset to convert)\n` +
        `🎯 Do: ${actionDesc}\n\n` +
        `Shall I activate this rule?\n\n` +
        `⚠️ <i>Time is in UTC. If you're in WAT (UTC+1), subtract 1 hour from your local time when setting rules.</i>`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  } catch (err: any) {
    console.error("[Natural Language Handler] error:", err);
    await ctx.reply("⚠️ I'm having trouble processing that right now. Please try again in a moment.");
  }
});

// ── Rule Confirmation ────────────────────────────────────────────────────────

bot.callbackQuery(/^confirm_rule:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const pendingId = ctx.match[1];
  const telegramId = ctx.from.id.toString();

  try {
    // 1. Fetch full rule from pending
    const { data: pending, error: fetchErr } = await supabaseAdmin
      .from("pending_rules")
      .select("*")
      .eq("id", pendingId)
      .eq("user_id", telegramId)
      .single();

    if (fetchErr || !pending) {
      console.warn("[confirm_rule] Pending rule not found:", pendingId, fetchErr);
      await ctx.editMessageText("❌ Rule expired or not found. Please try again.");
      return;
    }

    // 2. Insert into real rules table
    const { error: insertErr } = await supabaseAdmin
      .from("rules")
      .insert({
        user_id: pending.user_id,
        name: pending.name,
        trigger: pending.trigger,
        action: pending.action,
        status: "active",
        run_count: 0,
        next_run_at: computeNextRun(pending.trigger),
      });

    if (insertErr) throw insertErr;

    // 3. Delete from pending
    await supabaseAdmin
      .from("pending_rules")
      .delete()
      .eq("id", pending.id);

    const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
    const baseUrl = rawUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
    const dashboardUrl = `${baseUrl}/dashboard?uid=${telegramId}`;

    await ctx.editMessageText(
      `✅ <b>Rule activated!</b> "${pending.name}" is now live.\n\nI'll notify you every time it runs.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp(
          "View in Dashboard →",
          dashboardUrl
        ),
      }
    );
  } catch (err) {
    console.error("[confirm_rule] error:", err);
    await ctx.editMessageText("❌ Failed to activate rule. Please try again.");
  }
});

bot.callbackQuery(/^delete_pending:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const pendingId = ctx.match[1];
  
  await supabaseAdmin
    .from("pending_rules")
    .delete()
    .eq("id", pendingId);
    
  await ctx.editMessageText("Rule cancelled. Tell me if you want to set something else up!");
});

bot.callbackQuery("cancel_rule", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Rule cancelled. Tell me if you want to set something else up!");
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mainMenu(telegramId?: string) {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tonpilot.vercel.app";
  const baseUrl = rawUrl.replace(/\/dashboard\/?$/, "").replace(/\/$/, "");
  const dashboardUrl = telegramId ? `${baseUrl}/dashboard?uid=${telegramId}` : `${baseUrl}/dashboard`;

  return new InlineKeyboard()
    .webApp("📊 Dashboard", dashboardUrl)
    .row()
    .text("📋 My Rules", "show_rules")
    .text("💼 My Wallet", "show_wallet")
    .row()
    .text("💡 Examples", "show_examples");
}

function formatTrigger(trigger: any): string {
  if (!trigger) return "";

  switch (trigger.type) {
    case "schedule": {
      return cronToHuman(trigger.cron);
    }
    case "price_above":
      return `When TON price rises above $${trigger.threshold}`;
    case "price_below":
      return `When TON price drops below $${trigger.threshold}`;
    case "balance_below":
      return `When vault balance drops below ${trigger.threshold} TON`;
    case "balance_above":
      return `When vault balance rises above ${trigger.threshold} TON`;
    default:
      return trigger.type;
  }
}

function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Format time
  const h = parseInt(hour);
  const m = parseInt(minute);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minStr = m === 0 ? "00" : m < 10 ? `0${m}` : `${m}`;
  const timeStr = `${hour12}:${minStr} ${period} UTC`;

  // Day of week names
  const days: Record<string, string> = {
    "0": "Sunday", "1": "Monday", "2": "Tuesday",
    "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday"
  };

  // Month names
  const months: Record<string, string> = {
    "1": "January", "2": "February", "3": "March",
    "4": "April", "5": "May", "6": "June", "7": "July",
    "8": "August", "9": "September", "10": "October",
    "11": "November", "12": "December"
  };

  // Ordinal suffix helper
  function ordinal(n: number): string {
    const s = ["th","st","nd","rd"];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  }

  // Every day at X
  if (dayOfWeek === "*" && dayOfMonth === "*" && month === "*") {
    return `Every day at ${timeStr}`;
  }

  // Every [DayName] at X
  if (dayOfWeek !== "*" && dayOfMonth === "*" && month === "*") {
    return `Every ${days[dayOfWeek] ?? "day"} at ${timeStr}`;
  }

  // Nth of every month at X
  if (dayOfMonth !== "*" && dayOfWeek === "*" && month === "*") {
    return `${ordinal(parseInt(dayOfMonth))} of every month at ${timeStr}`;
  }

  // Specific month + day
  if (dayOfMonth !== "*" && month !== "*") {
    return `${ordinal(parseInt(dayOfMonth))} ${months[month] ?? ""} at ${timeStr}`;
  }

  // Every hour
  if (hour === "*") {
    return `Every hour at :${minStr} UTC`;
  }

  return `Every day at ${timeStr}`;
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

export function computeNextRun(trigger: any): string {
  if (trigger.type !== "schedule") {
    return new Date().toISOString();
  }

  const cron = trigger.cron;
  const parts = cron.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  const now = new Date();
  const next = new Date();
  next.setUTCSeconds(0, 0);

  const targetMinute = parseInt(minute);
  const targetHour = parseInt(hour);

  // Set to next occurrence of this hour:minute
  next.setUTCHours(targetHour, targetMinute, 0, 0);

  // If that time already passed today, move to tomorrow
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  // If dayOfWeek is specified, advance to next matching day
  if (dayOfWeek !== "*") {
    const targetDay = parseInt(dayOfWeek);
    while (next.getUTCDay() !== targetDay) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }

  // If dayOfMonth is specified
  if (dayOfMonth !== "*") {
    const targetDate = parseInt(dayOfMonth);
    next.setUTCDate(targetDate);
    if (next <= now) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
  }

  // Ensure it's in the future
  while (next <= now) {
    if (dayOfWeek !== "*" && dayOfMonth === "*") {
      next.setUTCDate(next.getUTCDate() + 7);
    } else if (dayOfMonth !== "*" && dayOfWeek === "*") {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }

  return next.toISOString();
}

function formatRelativeTime(dateInput: Date | string): string {
  const dateStr = typeof dateInput === "string" ? dateInput : dateInput.toISOString();
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // For very recent — keep relative
  if (diffMins < 1)   return "just now";
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffHours < 6)  return `${diffHours}h ago`;

  // For older — show full date with year
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }) + " UTC";
}

function getSmartSuggestion(action: any, trigger: any): string | null {
  // If they set a swap rule → suggest a price alert
  if (action.type === "swap" && trigger.type === "schedule") {
    return (
      `💡 *Smart Suggestion*\n\n` +
      `You've set up a scheduled swap. Want me to also ` +
      `alert you if TON drops 20% so you can buy the dip?\n\n` +
      `Just say: _"Alert me when TON drops below $[price]"_`
    );
  }

  // If they set a price alert → suggest DCA
  if (action.type === "alert" && 
      (trigger.type === "price_above" || trigger.type === "price_below")) {
    return (
      `💡 *Smart Suggestion*\n\n` +
      `Price alerts are great. Want to take it further ` +
      `with a weekly DCA? It pairs perfectly with price monitoring.\n\n` +
      `Try: _"Swap 10 TON to USDT every Monday"_`
    );
  }

  // If they set a send rule → suggest low balance alert
  if (action.type === "send") {
    return (
      `💡 *Smart Suggestion*\n\n` +
      `Recurring sends are great — but make sure your ` +
      `vault never runs dry. Want me to alert you when ` +
      `your balance drops too low?\n\n` +
      `Try: _"Alert me when my balance drops below 50 TON"_`
    );
  }

  return null;
}

// ── Error Handlers ────────────────────────────────────────────────────────────

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[Bot Error] Update ${ctx.update.update_id}:`, err.error);

  // Try to notify the user something went wrong
  ctx.reply(
    "⚠️ Something went wrong on my end. Please try again in a moment.\n\n" +
    "If this keeps happening, use /start to reset."
  ).catch(() => {}); // swallow if reply itself fails
});

// Register commands with Telegram for the bottom-left "/" menu
bot.api.setMyCommands([
  { command: "start", description: "Set up or return to TonPilot" },
  { command: "dashboard", description: "Open your automation dashboard" },
  { command: "pulse", description: "Live vault and market snapshot" },
  { command: "rules", description: "See your active rules" },
  { command: "wallet", description: "Check your vault balance" },
  { command: "history", description: "See your execution logs" },
  { command: "templates", description: "Browse quick start templates" },
  { command: "faucet", description: "Get testnet TON for testing" },
  { command: "help", description: "Show help and examples" },
]).catch(console.error);

// Explicitly reset the Menu Button to default (Slash/Menu icon)
bot.api.setChatMenuButton({
  menu_button: { type: "default" },
}).catch(console.error);


process.on("unhandledRejection", (reason) => {
  console.error("[UnhandledRejection]", reason);
});

