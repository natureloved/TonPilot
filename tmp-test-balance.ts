import "dotenv/config";
import { supabaseAdmin } from "./src/lib/supabase-admin";
import { WalletContractV5R1 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import axios from "axios";

async function check() {
  const { data: users } = await supabaseAdmin.from("users").select("*").limit(1);
  if (!users || users.length === 0) return console.log("No users found");
  
  const user = users[0];
  console.log("DB Address:", user.wallet_address);
  
  if (!user.wallet_mnemonic_enc) return console.log("No mnemonic");
  
  const mnemonicStr = Buffer.from(user.wallet_mnemonic_enc, "base64").toString("utf-8");
  const keyPair = await mnemonicToPrivateKey(mnemonicStr.split(" "));
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: keyPair.publicKey });
  const addrStr = wallet.address.toString({ urlSafe: true, bounceable: false });
  console.log("Derived Address:", addrStr);
  
  if (addrStr !== user.wallet_address) {
    console.log("MISMATCH!");
  } else {
    console.log("MATCH!");
  }
  
  try {
    const url = `https://testnet.toncenter.com/api/v2/getAddressBalance?address=${addrStr}`;
    console.log("Fetching:", url);
    const res = await axios.get(url);
    console.log("Balance:", Number(res.data.result)/1e9);
  } catch(e:any) {
    console.error("Axios Error:", e.response?.status, e.response?.data);
  }
}
check();
