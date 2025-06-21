import { PublicKey, Connection, VersionedTransaction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
  "confirmed"
);

interface TimeBasedParams {
  inAmount: number;
  numberOfOrders: number;
  interval: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  startAt?: number | null;
}

interface PriceBasedParams {
  depositAmount: number;
  incrementUsdcValue: number;
  interval: number;
  startAt?: number | null;
}

interface OrderParams {
  user: string;
  inputMint: string;
  outputMint: string;
  params: {
    time?: TimeBasedParams;
    price?: PriceBasedParams;
  };
}

interface CreateOrderResponse {
  transaction: string;
  requestId: string;
  [key: string]: any;
}

interface ExecuteOrderResponse {
  signature?: string;
  status: "Success" | "Failed";
  order?: string;
  error?: string;
}

class RecurringApiClient {
  private readonly baseUrl: string = "https://lite-api.jup.ag/recurring/v1";

  // Create an order
  async createOrder(params: OrderParams): Promise<CreateOrderResponse> {
    try {
      console.log("Request Body:", JSON.stringify(params, null, 2));

      const response = await fetch(`${this.baseUrl}/createOrder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data: CreateOrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error creating order:", error);
      throw error;
    }
  }

  // Execute an order
  async executeOrder(
    signedTransaction: string,
    requestId: string
  ): Promise<ExecuteOrderResponse> {
    try {
      const requestBody = {
        signedTransaction,
        requestId,
      };

      const response = await fetch(`${this.baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data: ExecuteOrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error executing order:", error);
      throw error;
    }
  }
}

async function createAndExecuteOrder() {
  const client = new RecurringApiClient();

  // Step 1: Create the order
  console.log("Step 1: Creating order...");

  // Replace with your wallet address
  const walletAddress = "YOUR_WALLET_ADDRESS";

  // Example: Create a time-based order
  const timeBasedOrderParams: OrderParams = {
    user: walletAddress,
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    outputMint: "So11111111111111111111111111111111111111112", // SOL
    params: {
      time: {
        inAmount: 100000000, // 100 USDC (minimum 100 USDC)
        numberOfOrders: 10,
        interval: 86400, // 1 day in seconds
        minPrice: null,
        maxPrice: null,
        startAt: null, // Start immediately
      },
    },
  };

  // Example: Create a price-based order
  const priceBasedOrderParams: OrderParams = {
    user: walletAddress,
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    outputMint: "So11111111111111111111111111111111111111112", // SOL
    params: {
      price: {
        depositAmount: 100000000, // 100 USDC (minimum 100 USDC)
        incrementUsdcValue: 5000000, // 5 USDC value per cycle
        interval: 86400, // 1 day in seconds
        startAt: null, // Start immediately
      },
    },
  };

  // Choose which order type to create
  const orderParams = timeBasedOrderParams; // or priceBasedOrderParams

  try {
    const orderResponse = await client.createOrder(orderParams);
    console.log("Create Order Response:");
    console.log(JSON.stringify(orderResponse, null, 2));

    // Step 2: Execute the order
    console.log("\nStep 2: Executing order...");

    // Extract the transaction from the order response
    const transactionBase64 = orderResponse.transaction;

    // Deserialize the transaction
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(transactionBase64, "base64")
    );

    // Get wallet from private key
    const PRIVATE_KEY = "YOUR_PRIVATE_KEY";
    if (!PRIVATE_KEY) {
      throw new Error(
        "Please provide your private key in the PRIVATE_KEY variable"
      );
    }

    const secretKey = bs58.decode(PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(secretKey);
    console.log("Using wallet public key:", wallet.publicKey.toBase58());

    // Sign the transaction
    transaction.sign([wallet]);

    // Serialize the transaction to base64 format
    const signedTransaction = Buffer.from(transaction.serialize()).toString(
      "base64"
    );

    // Get request ID from the create order response
    const requestId = orderResponse.requestId;

    // Method 1: Execute order via Jupiter API
    console.log("Executing order via Jupiter API...");
    const executeResponse = await client.executeOrder(
      signedTransaction,
      requestId
    );

    if (executeResponse.status === "Success") {
      console.log(
        `Order executed successfully: https://solscan.io/tx/${executeResponse.signature}`
      );
      console.log(`Order ID: ${executeResponse.order}`);
    } else {
      console.error(
        `Order execution failed: ${executeResponse.error}`,
        executeResponse
      );

      // Method 2: Send transaction yourself
      // If Method 1 fails, you can try sending the transaction yourself
      console.log("Trying to send transaction directly to Solana network...");
      const transactionBinary = transaction.serialize();

      const blockhashInfo = await connection.getLatestBlockhashAndContext({
        commitment: "finalized",
      });

      const signature = await connection.sendRawTransaction(transactionBinary, {
        maxRetries: 1,
        skipPreflight: true,
      });

      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: blockhashInfo.value.blockhash,
          lastValidBlockHeight: blockhashInfo.value.lastValidBlockHeight,
        },
        "finalized"
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(
            confirmation.value.err
          )}\n\nhttps://solscan.io/tx/${signature}`
        );
      } else {
        console.log(
          `Transaction successful: https://solscan.io/tx/${signature}`
        );
      }
    }
  } catch (error) {
    console.error("Failed to create or execute order:", error);
  }
}

createAndExecuteOrder().catch(console.error);
