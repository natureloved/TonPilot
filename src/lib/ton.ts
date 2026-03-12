/**
 * TON Wallet Utilities
 *
 * TonPilot uses @ton/mcp as the execution layer for all blockchain operations.
 * Instead of calling the MCP server directly (which requires a running process),
 * we wrap the @ton/ton SDK for read operations and spawn @ton/mcp for write operations.
 *
 * Architecture:
 *   - Read ops  (balance, price)  → @ton/ton SDK directly
 *   - Write ops (swap, send)      → @ton/mcp HTTP server running alongside the app
 */

import { TonClient, WalletContractV5R1, internal } from "@ton/ton";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";

// ── TON Client ───────────────────────────────────────────────────────────────

export function getTonClient() {
  const isTestnet = process.env.TON_NETWORK === "testnet";
  const endpoint = isTestnet
    ? "https://testnet.toncenter.com/api/v2/jsonRPC"
    : "https://toncenter.com/api/v2/jsonRPC";

  return new TonClient({
    endpoint,
    apiKey: process.env.TONCENTER_API_KEY,
  });
}

// ── Wallet Creation ──────────────────────────────────────────────────────────

/**
 * Creates a new agentic sub-wallet for a user.
 * The mnemonic is returned so you can encrypt + store it in Supabase.
 * NEVER log the mnemonic.
 */
export async function createAgenticWallet(): Promise<{
  address: string;
  mnemonic: string[];
}> {
  const mnemonic = await mnemonicNew(24);
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  const client = getTonClient();
  const wallet = WalletContractV5R1.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });

  const contract = client.open(wallet);
  const address = contract.address.toString({ urlSafe: true, bounceable: false });

  return { address, mnemonic };
}

// ── Balance Queries ──────────────────────────────────────────────────────────

export async function getTonBalance(address: string): Promise<number> {
  try {
    const client = getTonClient();
    const balance = await client.getBalance(
      // Convert friendly address to internal
      (await import("@ton/ton")).Address.parse(address)
    );
    // Balance is in nanoTON, convert to TON
    return Number(balance) / 1e9;
  } catch (err) {
    console.error("[getTonBalance] error:", err);
    return 0;
  }
}

// ── Price Queries ────────────────────────────────────────────────────────────

export async function getTonPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { next: { revalidate: 60 } } // Cache for 60 seconds (Next.js fetch cache)
    );
    const data = await res.json();
    return data["the-open-network"]?.usd ?? 0;
  } catch (err) {
    console.error("[getTonPrice] error:", err);
    return 0;
  }
}

// ── MCP Execution ────────────────────────────────────────────────────────────

/**
 * Calls the @ton/mcp HTTP server to execute a swap or send.
 *
 * SETUP: Run @ton/mcp as a sidecar process:
 *   MNEMONIC="..." npx @ton/mcp@alpha --http 3001
 *
 * Then set TON_MCP_URL=http://localhost:3001 in your env.
 *
 * For production on Vercel, use a Railway or Fly.io sidecar.
 */
export async function executeMcpAction(
  walletMnemonic: string,
  action: { type: string; [key: string]: unknown }
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const mcpUrl = process.env.TON_MCP_URL ?? "http://localhost:3001";

  try {
    // Build the prompt that @ton/mcp understands
    let prompt = "";
    if (action.type === "swap") {
      prompt = `Swap ${action.amount} ${action.fromAsset} to ${action.toAsset} using the best available rate`;
    } else if (action.type === "send") {
      prompt = `Send ${action.amount} ${action.asset} to ${action.toAddress}`;
    } else {
      // Alert-only — no blockchain action needed
      return { success: true };
    }

    const response = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "chat",
          arguments: { message: prompt },
          env: { MNEMONIC: walletMnemonic },
        },
      }),
    });

    const result = await response.json();

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    // Extract tx hash from MCP response if present
    const txHash = result.result?.content?.[0]?.text?.match(/[A-Za-z0-9+/]{44,}/)?.[0];
    return { success: true, txHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
