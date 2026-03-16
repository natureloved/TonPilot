// ─── Rule Types ───────────────────────────────────────────────────────────────

export type TriggerType = "schedule" | "price_above" | "price_below" | "balance_below" | "balance_above";
export type ActionType = "swap" | "send" | "alert";
export type RuleStatus = "active" | "paused" | "completed" | "failed";

export interface ScheduleTrigger {
  type: "schedule";
  cron: string;         // e.g. "0 9 * * 5" = every Friday 9am
  timezone: string;     // e.g. "UTC"
}

export interface PriceTrigger {
  type: "price_above" | "price_below";
  asset: string;        // e.g. "TON"
  threshold: number;    // e.g. 5.00
  currency: string;     // e.g. "USD"
}

export interface BalanceTrigger {
  type: "balance_below" | "balance_above";
  threshold: number;    // e.g. 100 TON
}

export type Trigger = ScheduleTrigger | PriceTrigger | BalanceTrigger;

export interface SwapAction {
  type: "swap";
  fromAsset: string;    // e.g. "TON"
  toAsset: string;      // e.g. "USDT"
  amount: number;
}

export interface SendAction {
  type: "send";
  asset: string;        // e.g. "TON"
  amount: number;
  toAddress: string;
}

export interface AlertAction {
  type: "alert";
  message: string;
}

export type Action = SwapAction | SendAction | AlertAction;

// ─── DB Row Shape (matches Supabase table) ────────────────────────────────────

export interface Rule {
  id: string;
  user_id: string;          // Telegram user ID (stored as string)
  name: string;             // Human-readable label
  trigger: Trigger;
  action: Action;
  status: RuleStatus;
  run_count: number;
  streak_count: number;
  longest_streak: number;
  fail_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface User {
  id: string;               // Telegram user ID
  telegram_username: string | null;
  wallet_address: string | null;     // Agentic sub-wallet address
  wallet_mnemonic_enc: string | null; // Encrypted mnemonic (never log this)
  onboarded_at: string | null;
  created_at: string;
}

export interface ExecutionLog {
  id: string;
  rule_id: string;
  user_id: string;
  status: "success" | "failed";
  tx_hash: string | null;
  error_message: string | null;
  executed_at: string;
}

// ─── Claude Intent Parser Output ─────────────────────────────────────────────

export interface ParsedIntent {
  success: boolean;
  rule?: {
    name: string;
    trigger: Trigger;
    action: Action;
  };
  error?: string;           // If Claude couldn't parse the message
  clarification?: string;   // If Claude needs more info from the user
}
