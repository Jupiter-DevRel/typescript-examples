import {
  Keypair,
  VersionedTransaction,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import { ReferralProvider } from "@jup-ag/referral-sdk";

interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  platformFeeBps?: number;
}

interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  outAmount: string;
}

interface ExecuteResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit?: number;
  prioritizationType: {
    computeBudget: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  dynamicSlippageReport: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
    categoryName: string;
    heuristicMaxSlippageBps: number;
  };
  simulationError: string | null;
}

// API Client
class V1ApiClient {
  private readonly baseUrl: string = "https://lite-api.jup.ag/swap/v1";

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    try {
      const url = new URL(`${this.baseUrl}/quote`);
      url.searchParams.append("inputMint", params.inputMint);
      url.searchParams.append("outputMint", params.outputMint);
      url.searchParams.append("amount", params.amount.toString());
      url.searchParams.append("slippageBps", params.slippageBps.toString());
      // You can add restrictIntermediateTokens for more stable routes
      url.searchParams.append("restrictIntermediateTokens", "true");

      // Add platform fee that you want to earn from the swap
      if (params.platformFeeBps) {
        url.searchParams.append(
          "platformFeeBps",
          params.platformFeeBps.toString()
        );
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: QuoteResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching quote:", error);
      throw error;
    }
  }

  async executeSwap(
    quoteResponse: QuoteResponse,
    userPublicKey: string,
    dynamicComputeUnitLimit: boolean,
    dynamicSlippage: boolean,
    feeAccount?: string
  ): Promise<ExecuteResponse> {
    try {
      const requestBody: any = {
        quoteResponse,
        userPublicKey,
        payer: userPublicKey, // This is the wallet that will pay for the swap (required)
        dynamicComputeUnitLimit, // Estimate compute units dynamically
        dynamicSlippage, // Estimate slippage dynamically
        // Priority fee optimization
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000, // Cap fee at 0.001 SOL
            global: false, // Use local fee market for better estimation
            priorityLevel: "veryHigh", // veryHigh === 75th percentile for better landing
          },
        },
      };

      // Add fee account if provided
      if (feeAccount) {
        requestBody.feeAccount = feeAccount;
      }

      const response = await fetch(`${this.baseUrl}/swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          //   "x-api-key": "YOUR_API_KEY",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ExecuteResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error building transaction:", error);
      throw error;
    }
  }
}

async function quoteAndSwap() {
  const client = new V1ApiClient();
  const connection = new Connection(
    "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
    "confirmed"
  );

  // Initialize referral provider
  const provider = new ReferralProvider(connection);

  // Your referral account (you need to create this first using the Jupiter dashboard or SDK)
  const referralAccount = new PublicKey("YOUR_REFERRAL_KEY");
  // For this example, we'll be using USDC as the mint account because it is the outputMint (CHANGE THIS TO YOUR ACCORDINGLY)
  const mintAccount = new PublicKey(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  ); // USDC mint

  const quoteParams: QuoteParams = {
    inputMint: "So11111111111111111111111111111111111111112", // SOL
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    amount: 10000, // 0.00001 SOL
    slippageBps: 500, // 5%
    platformFeeBps: 20, // 0.2% fee
  };

  try {
    const quote = await client.getQuote(quoteParams);
    console.log("Quote Response:");
    console.log(JSON.stringify(quote, null, 2));

    if (!quote.outAmount) {
      throw new Error("No outAmount found in quote response");
    }

    const PRIVATE_KEY = "YOUR_PRIVATE_KEY";
    if (!PRIVATE_KEY) {
      throw new Error(
        "Please provide your private key in the PRIVATE_KEY variable"
      );
    }

    const secretKey = bs58.decode(PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(secretKey);
    console.log("Using wallet public key:", wallet.publicKey.toBase58());

    // Get or create referral token account
    const { tx, referralTokenAccountPubKey } =
      await provider.initializeReferralTokenAccount({
        payerPubKey: wallet.publicKey,
        referralAccountPubKey: referralAccount,
        mint: mintAccount,
      });

    const referralTokenAccount = await connection.getAccountInfo(
      referralTokenAccountPubKey
    );

    // Initialize token account if it doesn't exist
    if (!referralTokenAccount) {
      console.log("Initializing referral token account...");
      const signature = await connection.sendTransaction(tx, [wallet]);
      await connection.confirmTransaction(signature);
      console.log(
        "Referral token account initialized:",
        referralTokenAccountPubKey.toBase58()
      );
    } else {
      console.log(
        "Referral token account already exists:",
        referralTokenAccountPubKey.toBase58()
      );
    }

    const executeResponse = await client.executeSwap(
      quote,
      wallet.publicKey.toBase58(),
      true,
      true,
      referralTokenAccountPubKey.toBase58()
    );

    if (executeResponse.simulationError === null) {
      console.log(
        "Swap transaction built successfully:",
        JSON.stringify(executeResponse, null, 2)
      );

      // 1. Deserialize the transaction from base64 format
      const transactionBinary = Buffer.from(
        executeResponse.swapTransaction,
        "base64"
      );
      const transaction = VersionedTransaction.deserialize(transactionBinary);

      // 2. Sign the transaction with the wallet
      transaction.sign([wallet]);

      // 3. Serialize the transaction back to binary format
      const signedTransactionBinary = transaction.serialize();

      // 4. Send the transaction to the Solana network with optimized parameters
      console.log("Sending transaction to Solana network...");
      const signature = await connection.sendRawTransaction(
        signedTransactionBinary,
        {
          maxRetries: 2, // Increase retries for better chance of landing
          skipPreflight: true, // Skip preflight checks to avoid false negatives
        }
      );

      // 5. Confirm the transaction with appropriate commitment level
      console.log(`Transaction sent with signature: ${signature}`);
      console.log(
        `Check transaction status at: https://solscan.io/tx/${signature}/`
      );

      // Check transaction confirmation
      const confirmation = await connection.confirmTransaction(
        signature,
        "processed" // Use "processed" instead of "confirmed" for faster initial confirmation
      );

      if (confirmation.value.err) {
        console.error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      } else {
        console.log(
          `Transaction successful: https://solscan.io/tx/${signature}/`
        );
      }
    } else {
      console.error(
        "Swap simulation failed:",
        JSON.stringify(executeResponse, null, 2)
      );
    }
  } catch (error) {
    console.error("Failed to process quote and swap:", error);
  }
}

quoteAndSwap().catch(console.error);
