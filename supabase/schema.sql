-- ─────────────────────────────────────────────────────────
-- TonPilot Database Schema
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Users ──────────────────────────────────────────────────────────────────

create table if not exists users (
  id                  text primary key,           -- Telegram user ID
  telegram_username   text,
  wallet_address      text unique,                -- Agentic sub-wallet address on TON
  wallet_mnemonic_enc text,                       -- Base64 encoded mnemonic (encrypt properly in prod)
  onboarded_at        timestamptz,
  created_at          timestamptz default now()
);

-- ── Rules ──────────────────────────────────────────────────────────────────

create type rule_status as enum ('active', 'paused', 'completed', 'failed');

create table if not exists rules (
  id           uuid primary key default uuid_generate_v4(),
  user_id      text not null references users(id) on delete cascade,
  name         text not null,
  trigger      jsonb not null,                    -- ScheduleTrigger | PriceTrigger | BalanceTrigger
  action       jsonb not null,                    -- SwapAction | SendAction | AlertAction
  status       rule_status not null default 'active',
  run_count    int not null default 0,
  last_run_at  timestamptz,
  next_run_at  timestamptz,
  created_at   timestamptz default now()
);

create index idx_rules_user_id on rules(user_id);
create index idx_rules_status  on rules(status);

-- ── Execution Logs ─────────────────────────────────────────────────────────

create type exec_status as enum ('success', 'failed');

create table if not exists execution_logs (
  id             uuid primary key default uuid_generate_v4(),
  rule_id        uuid not null references rules(id) on delete cascade,
  user_id        text not null references users(id) on delete cascade,
  status         exec_status not null,
  tx_hash        text,
  error_message  text,
  executed_at    timestamptz default now()
);

create index idx_exec_logs_rule_id on execution_logs(rule_id);
create index idx_exec_logs_user_id on execution_logs(user_id);

-- ── Pending Rules (for Bot Callbacks) ───────────────────────────────────────

create table if not exists pending_rules (
  id           uuid primary key default uuid_generate_v4(),
  user_id      text not null references users(id) on delete cascade,
  name         text not null,
  trigger      jsonb not null,
  action       jsonb not null,
  created_at   timestamptz default now()
);

create index idx_pending_rules_user_id on pending_rules(user_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Note: Bot uses service role key (bypasses RLS).
-- RLS protects the Mini App (anon key) — users only see their own data.

alter table users             enable row level security;
alter table rules             enable row level security;
alter table execution_logs    enable row level security;

-- Users can only read their own profile
create policy "users_own_data" on users
  for select using (auth.uid()::text = id);

-- Users can only see their own rules
create policy "rules_own_data" on rules
  for all using (auth.uid()::text = user_id);

-- Users can only see their own logs
create policy "logs_own_data" on execution_logs
  for select using (auth.uid()::text = user_id);
