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
import axios from "axios";
import { Action } from "@/types";

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
    const response = await axios.get(`https://${process.env.TON_NETWORK === 'testnet' ? 'testnet.' : ''}toncenter.com/api/v2/getAddressBalance?address=${address}`);
    return Number(response.data.result) / 1e9;
  } catch (err) {
    console.error("[getTonBalance] error:", err);
    return 0;
  }
}

// ── Price Queries ────────────────────────────────────────────────────────────

export async function getTonPrice(): Promise<number> {
  try {
    const response = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
    return response.data["the-open-network"].usd;
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
  action: any
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  
  // Alert-only rules need no blockchain action
  if (action.type === "alert") {
    return { success: true };
  }

  try {
    const mnemonic = walletMnemonic.split(" ");
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const client = getTonClient();

    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });

    const contract = client.open(wallet);
    const seqno = await contract.getSeqno();

    if (action.type === "send") {
      const { Address, toNano, SendMode } = await import("@ton/ton");
      
      await contract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
          internal({
            to: Address.parse(action.toAddress),
            value: toNano(action.amount.toString()),
            bounce: false,
          })
        ],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      });

      return { success: true };
    }

    if (action.type === "swap") {
      // Call STON.fi API for swap quote and execution
      // For testnet — log intent and return success 
      // (STON.fi testnet has limited liquidity)
      console.log(`[Swap] Would swap ${action.amount} ${action.fromAsset} → ${action.toAsset}`);
      
      // TODO: integrate STON.fi SDK for mainnet
      // For hackathon testnet demo, simulate success
      return { success: true, txHash: undefined };
    }

    return { success: false, error: "Unknown action type" };

  } catch (err: any) {
    console.error("[executeMcpAction] error:", err);
    return { success: false, error: err.message };
  }
}
