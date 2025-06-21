import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

interface OrderParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  taker?: string;
}

interface OrderResponse {
  id: string;
  inputMint: string;
  outputMint: string;
  amount: string;
  transaction?: string;
  requestId: string;
  [key: string]: any;
}

interface ExecuteResponse {
  status: "Success" | "Failed" | string;
  signature: string;
  [key: string]: any;
}

// API Client
class UltraApiClient {
  private readonly baseUrl: string = "https://lite-api.jup.ag/ultra/v1";

  async getOrder(params: OrderParams): Promise<OrderResponse> {
    try {
      const url = new URL(`${this.baseUrl}/order`);
      url.searchParams.append("inputMint", params.inputMint);
      url.searchParams.append("outputMint", params.outputMint);
      url.searchParams.append("amount", params.amount.toString());
      if (params.taker) {
        url.searchParams.append("taker", params.taker);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: OrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching order:", error);
      throw error;
    }
  }

  async executeOrder(
    signedTransaction: string,
    requestId: string
  ): Promise<ExecuteResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTransaction, requestId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ExecuteResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error executing order:", error);
      throw error;
    }
  }
}

async function orderAndExecute() {
  const client = new UltraApiClient();

  const orderParams: OrderParams = {
    inputMint: "So11111111111111111111111111111111111111112", // SOL
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    amount: 10000, // 0.00001 SOL
    taker: "YOUR_WALLET_ADDRESS", // This will be the wallet address that receives the outputMint
  };

  try {
    // Step 1: Get the order
    const order = await client.getOrder(orderParams);
    console.log("Order Response:");
    console.log(JSON.stringify(order, null, 2));

    if (!order.transaction) {
      throw new Error("No transaction found in order response");
    }

    // Step 2: Sign the transaction
    // Instructions for users:
    // Replace PRIVATE_KEY with your base58-encoded private key string (e.g., from Phantom "Export Private Key").
    // Format: A string like "2q7pyhPwAw...zY" (typically 88-89 characters long).
    // - Get this from your Solana wallet by exporting your private key.
    // - The public key derived from this must match the 'taker' address above.
    const PRIVATE_KEY = "YOUR_PRIVATE_KEY"; // Replace with your base58 private key
    if (!PRIVATE_KEY) {
      throw new Error(
        "Please provide your private key in the PRIVATE_KEY variable"
      );
    }
    const secretKey = bs58.decode(PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(secretKey);
    console.log("Using wallet public key:", wallet.publicKey.toBase58());

    // Verify the taker matches the wallet
    if (wallet.publicKey.toBase58() !== orderParams.taker) {
      throw new Error(
        `Wallet public key (${wallet.publicKey.toBase58()}) does not match taker (${
          orderParams.taker
        })`
      );
    }

    const transaction = VersionedTransaction.deserialize(
      Buffer.from(order.transaction, "base64")
    );
    transaction.sign([wallet]);
    const signedTransaction = Buffer.from(transaction.serialize()).toString(
      "base64"
    );

    // Step 3: Execute the order
    const executeResponse = await client.executeOrder(
      signedTransaction,
      order.requestId
    );

    // Step 4: Handle the response
    if (executeResponse.status === "Success") {
      console.log("Swap successful:", JSON.stringify(executeResponse, null, 2));
      console.log(`https://solscan.io/tx/${executeResponse.signature}`);
    } else {
      console.error("Swap failed:", JSON.stringify(executeResponse, null, 2));
      console.log(`https://solscan.io/tx/${executeResponse.signature}`);
    }
  } catch (error) {
    console.error("Failed to process order:", error);
  }
}

orderAndExecute().catch(console.error);
