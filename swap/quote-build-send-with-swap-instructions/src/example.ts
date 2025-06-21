import {
  Keypair,
  VersionedTransaction,
  Connection,
  TransactionInstruction,
  PublicKey,
  AddressLookupTableAccount,
  TransactionMessage,
} from "@solana/web3.js";
import bs58 from "bs58";

interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}

interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  outAmount: string;
}

interface InstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface Instruction {
  programId: string;
  accounts: InstructionAccount[];
  data: string;
}

interface SwapInstructionsResponse {
  tokenLedgerInstruction?: Instruction;
  computeBudgetInstructions: Instruction[];
  setupInstructions: Instruction[];
  swapInstruction: Instruction;
  cleanupInstruction?: Instruction;
  addressLookupTableAddresses: string[];
  error?: string;
}

// API Client
class V1ApiClient {
  private readonly baseUrl: string = "https://liteapi.jup.ag/swap/v1";

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    try {
      const url = new URL(`${this.baseUrl}/quote`);
      url.searchParams.append("inputMint", params.inputMint);
      url.searchParams.append("outputMint", params.outputMint);
      url.searchParams.append("amount", params.amount.toString());
      url.searchParams.append("slippageBps", params.slippageBps.toString());
      // You can add restrictIntermediateTokens for more stable routes
      url.searchParams.append("restrictIntermediateTokens", "true");

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

  async getSwapInstructions(
    quoteResponse: QuoteResponse,
    userPublicKey: string,
    dynamicComputeUnitLimit: boolean,
    dynamicSlippage: boolean
  ): Promise<SwapInstructionsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/swap-instructions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          //   "x-api-key": "YOUR_API_KEY",
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
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
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SwapInstructionsResponse = await response.json();

      if (data.error) {
        throw new Error("Failed to get swap instructions: " + data.error);
      }
      return data;
    } catch (error) {
      console.error("Error building transaction:", error);
      throw error;
    }
  }
}

// Helper functions

async function quoteAndBuildSwapInstructions() {
  const client = new V1ApiClient();

  const quoteParams: QuoteParams = {
    inputMint: "So11111111111111111111111111111111111111112", // SOL
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    amount: 10000, // 0.00001 SOL
    slippageBps: 500, // 5%
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

    //  1. Get swap instructions
    const swapInstructions = await client.getSwapInstructions(
      quote,
      wallet.publicKey.toBase58(),
      true,
      true
    );

    console.log(
      "Swap instructions received successfully:",
      JSON.stringify(swapInstructions, null, 2)
    );

    const connection = new Connection(
      "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
      "confirmed"
    );

    // Helper function to deserialize instructions
    const deserializeInstruction = (
      instruction: Instruction
    ): TransactionInstruction => {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
      });
    };

    // Helper function to get address lookup table accounts
    const getAddressLookupTableAccounts = async (
      keys: string[]
    ): Promise<AddressLookupTableAccount[]> => {
      const addressLookupTableAccountInfos =
        await connection.getMultipleAccountsInfo(
          keys.map((key) => new PublicKey(key))
        );

      return addressLookupTableAccountInfos.reduce(
        (acc, accountInfo, index) => {
          const addressLookupTableAddress = keys[index];
          if (accountInfo) {
            const addressLookupTableAccount = new AddressLookupTableAccount({
              key: new PublicKey(addressLookupTableAddress),
              state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            acc.push(addressLookupTableAccount);
          }

          return acc;
        },
        new Array<AddressLookupTableAccount>()
      );
    };

    // 2. Get address lookup table accounts
    const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
    if (swapInstructions.addressLookupTableAddresses.length > 0) {
      addressLookupTableAccounts.push(
        ...(await getAddressLookupTableAccounts(
          swapInstructions.addressLookupTableAddresses
        ))
      );
    }

    // 3. Build instructions array
    const instructions: TransactionInstruction[] = [];

    // 4. Add compute budget instructions if any
    if (swapInstructions.computeBudgetInstructions.length > 0) {
      console.log(
        "Adding compute budget instructions:",
        swapInstructions.computeBudgetInstructions.length
      );
      instructions.push(
        ...swapInstructions.computeBudgetInstructions.map(
          deserializeInstruction
        )
      );
    }

    // 5. Add setup instructions
    if (swapInstructions.setupInstructions.length > 0) {
      console.log(
        "Adding setup instructions:",
        swapInstructions.setupInstructions.length
      );
      instructions.push(
        ...swapInstructions.setupInstructions.map(deserializeInstruction)
      );
    }

    // 6. Add the swap instruction
    console.log("Adding swap instruction");
    instructions.push(deserializeInstruction(swapInstructions.swapInstruction));

    // 7. Add cleanup instruction if available
    if (swapInstructions.cleanupInstruction) {
      console.log("Adding cleanup instruction");
      instructions.push(
        deserializeInstruction(swapInstructions.cleanupInstruction)
      );
    }

    console.log("Total instructions:", instructions.length);

    // 7. Get latest blockhash
    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    // 8. Create transaction message
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(addressLookupTableAccounts);

    // 9. Create versioned transaction
    const transaction = new VersionedTransaction(messageV0);

    // 10. Sign the transaction with the wallet
    transaction.sign([wallet]);

    // 11.Serialize the transaction back to binary format
    const signedTransactionBinary = transaction.serialize();

    // 12. Simulate the transaction first to check for errors
    console.log("Simulating transaction...");
    try {
      const simulationResult = await connection.simulateTransaction(
        transaction
      );
      if (simulationResult.value.err) {
        console.error(
          "Transaction simulation failed:",
          simulationResult.value.err
        );
        console.error("Logs:", simulationResult.value.logs);
        throw new Error(
          `Simulation failed: ${JSON.stringify(simulationResult.value.err)}`
        );
      } else {
        console.log("Transaction simulation successful");
        console.log("Simulation logs:", simulationResult.value.logs);
      }
    } catch (error) {
      console.error("Error during transaction simulation:", error);
    }

    // 13. Send the transaction to the Solana network with optimized parameters
    console.log("Sending transaction to Solana network...");
    const signature = await connection.sendRawTransaction(
      signedTransactionBinary,
      {
        maxRetries: 2, // Increase retries for better chance of landing
        skipPreflight: false, // Enable preflight checks to catch errors
      }
    );

    // 14. Confirm the transaction with appropriate commitment level
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
  } catch (error) {
    console.error("Failed to process quote and swap:", error);
  }
}

quoteAndBuildSwapInstructions().catch(console.error);
