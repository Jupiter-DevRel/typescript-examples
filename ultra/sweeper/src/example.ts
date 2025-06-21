// main.ts

import "dotenv/config";
import fetch from "node-fetch";
import bs58 from "bs58";
import { Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// Type definitions for API responses
interface BalanceData {
  amount: string;
}

interface OrderData {
  transaction: string;
  requestId: string;
}

interface ExecData {
  signature: string;
  status: string;
  code?: string;
  error?: string;
}

console.log("🚀  Starting sell-all-to-JUP script…");

async function main() {
  const PRIVATE_KEY = "YOUR_PRIVATE_KEY"; // Replace with your base58 private key
  if (!PRIVATE_KEY) {
    throw new Error(
      "Please provide your private key in the PRIVATE_KEY variable"
    );
  }
  const secretKey = bs58.decode(PRIVATE_KEY);
  const wallet = Keypair.fromSecretKey(secretKey);
  console.log("Using wallet public key:", wallet.publicKey.toBase58());

  // ─── Fetch all balances via Ultra API ──────────────────────────────────
  const pubkey = wallet.publicKey.toString();
  const balancesRes = await fetch(
    `https://lite-api.jup.ag/ultra/v1/balances/${pubkey}`
  );
  if (!balancesRes.ok) {
    const err = await balancesRes.json().catch(() => null);
    console.error("Error fetching balances:", err || balancesRes.statusText);
    process.exit(1);
  }
  const balances = (await balancesRes.json()) as Record<string, BalanceData>;
  console.log("Balances response:", balances);

  // ─── JUP token mint (target for all swaps) ─────────────────────────────
  const JUP_MINT = new PublicKey(
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
  ).toString(); // :contentReference[oaicite:0]{index=0}

  // ─── Loop & sell each SPL token into JUP ───────────────────────────────
  for (const [mint, data] of Object.entries(balances)) {
    // skip native SOL and already-JUP balances
    if (mint === "SOL" || mint === JUP_MINT) continue;

    console.log(`\n▸ Selling ${data.amount} of ${mint} for JUP...`);

    // 1) Create an order
    const params = new URLSearchParams({
      inputMint: mint,
      outputMint: JUP_MINT,
      amount: data.amount.toString(),
      taker: pubkey,
    });
    const orderRes = await fetch(
      `https://lite-api.jup.ag/ultra/v1/order?${params}`
    );
    if (!orderRes.ok) {
      const err = await orderRes.json().catch(() => null);
      console.error(
        `Error creating order for ${mint}:`,
        err || orderRes.statusText
      );
      continue;
    }
    const orderData = (await orderRes.json()) as OrderData;
    console.log("Order response:", orderData);

    // 2) Deserialize the VersionedTransaction
    const txBuffer = Buffer.from(orderData.transaction, "base64");
    const versionedTx = VersionedTransaction.deserialize(txBuffer); // :contentReference[oaicite:1]{index=1}

    // 3) Sign it
    versionedTx.sign([wallet]);

    // 4) Serialize and encode
    const signedBinary = versionedTx.serialize();
    const signedBase64 = Buffer.from(signedBinary).toString("base64");

    // 5) Execute swap
    const execRes = await fetch("https://lite-api.jup.ag/ultra/v1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedTransaction: signedBase64,
        requestId: orderData.requestId,
      }),
    });
    if (!execRes.ok) {
      const err = await execRes.json().catch(() => null);
      console.error(
        `Error executing order for ${mint}:`,
        err || execRes.statusText
      );
      continue;
    }
    const execData = (await execRes.json()) as ExecData;
    const sig = execData.signature;
    if (execData.status === "Success") {
      console.log(`✅ Success! https://solscan.io/tx/${sig}`);
    } else {
      console.error(`❌ Failed! Signature: ${sig}`);
      console.error(`   Code: ${execData.code}, Message: ${execData.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
