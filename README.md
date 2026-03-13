# ✈️ TonPilot

> Automate your TON wallet — swaps, sends, alerts — all from Telegram.

Built for the **TON AI Agent Hackathon** (March 11–25, 2026) · Track 2: User-Facing Agents

---

## Stack

| Layer | Tech |
|---|---|
| Bot interface | Grammy.js (Telegram Bot API) |
| Mini App | Next.js 14 + Tailwind |
| AI intent parser | Claude API (claude-sonnet-4) |
| Blockchain execution | @ton/mcp (agentic wallet) |
| Database | Supabase (PostgreSQL) |
| Scheduler | Vercel Cron (every minute) |
| Deployment | Vercel |

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/yourhandle/tonpilot
cd tonpilot
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Fill in all values — see comments in the file
```

### 3. Set up Supabase

- Create a new Supabase project at supabase.com
- Open the SQL editor and run `supabase/schema.sql`
- Copy your project URL and keys into `.env.local`

### 4. Register your Telegram bot

- Message @BotFather on Telegram
- Send `/newbot` and follow the prompts
- Copy the token into `TELEGRAM_BOT_TOKEN`
- Set bot commands:
  ```
  start - Set up TonPilot
  wallet - Check your vault balance
  rules - See your active rules
  help - Show help
  ```

### 5. Set up the webhook

After deploying to Vercel, register your bot webhook:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-app.vercel.app/api/bot" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### 6. Run @ton/mcp sidecar (local dev)

```bash
# In a separate terminal
MNEMONIC="" npx @ton/mcp@alpha --http 3001
```

For production, deploy @ton/mcp on Railway or Fly.io and set `TON_MCP_URL`.

### 7. Start dev server

```bash
npm run dev
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── bot/route.ts          ← Telegram webhook handler
│   │   ├── scheduler/route.ts    ← Cron job: checks & fires rules
│   │   ├── rules/route.ts        ← CRUD API for rules (Mini App)
│   │   └── wallet/route.ts       ← Wallet balance API
│   └── dashboard/                ← Telegram Mini App (Next.js)
├── lib/
│   ├── bot.ts                    ← Grammy bot: commands & NL handler
│   ├── intent-parser.ts          ← Claude API: text → rule JSON
│   ├── ton.ts                    ← TON wallet & @ton/mcp utils
│   └── supabase.ts               ← Supabase clients
└── types/
    └── index.ts                  ← Shared TypeScript types
supabase/
└── schema.sql                    ← Database schema
vercel.json                       ← Cron schedule (every minute)
```

---

## How It Works

1. User sends a message to the Telegram bot
2. Claude API parses the message into a structured rule (trigger + action)
3. Bot shows a confirmation card — user taps Activate
4. Rule is saved to Supabase
5. Vercel cron runs every minute, checks all active rules
6. When a trigger fires, @ton/mcp executes the blockchain action
7. User receives a Telegram notification with the result + tx link

---

## Deployment Checklist

- [ ] Supabase project created, schema.sql executed
- [ ] All env vars set in Vercel dashboard
- [ ] Telegram webhook registered
- [ ] @ton/mcp sidecar deployed (Railway/Fly.io) for production
- [ ] `CRON_SECRET` set to protect the scheduler endpoint
- [ ] Test on TON testnet before mainnet

---

## Hackathon Notes

- Uses **@ton/mcp** and **Agentic Wallet** — both recommended by TON docs
- Vercel Cron fires every minute (free tier supports this)
- All rule execution happens server-side — users don't sign individual transactions
- TON testnet used during development; switch `TON_NETWORK=mainnet` for production
