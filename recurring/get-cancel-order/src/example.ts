import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
  "confirmed"
);

interface RecurringOrder {
  userPubkey: string;
  orderKey: string;
  inputMint: string;
  outputMint: string;
  inDeposited: string;
  inWithdrawn: string;
  inUsed: string;
  outReceived: string;
  outWithdrawn: string;
  trades: any[];
  [key: string]: any;
}

interface TimeBasedRecurringOrder extends RecurringOrder {
  cycleFrequency: string;
  inAmountPerCycle: string;
  minOutAmount: string;
  maxOutAmount: string;
}

interface PriceBasedRecurringOrder extends RecurringOrder {
  orderInterval: string;
  incrementalUsdValue: string;
  supposedUsdValue: string;
}

interface GetRecurringOrdersResponse {
  user: string;
  orderStatus: string;
  all?: RecurringOrder[];
  time?:
    | TimeBasedRecurringOrder[]
    | {
        orders: TimeBasedRecurringOrder[];
        totalPages: number;
        page: number;
      };
  price?:
    | PriceBasedRecurringOrder[]
    | {
        orders: PriceBasedRecurringOrder[];
        totalPages: number;
        page: number;
      };
  totalPages?: number;
  page?: number;
}

interface CancelOrderResponse {
  transaction: string;
  requestId: string;
}

interface ExecuteCancelOrderResponse {
  signature?: string;
  status: "Success" | "Failed";
  error?: string;
  code?: number;
}

class RecurringApiClient {
  private readonly baseUrl: string = "https://lite-api.jup.ag/recurring/v1";

  // Get recurring orders
  async getRecurringOrders(
    userAddress: string,
    orderStatus: "active" | "history" = "active",
    recurringType: "time" | "price" | "all" = "all",
    includeFailedTx: boolean = true
  ): Promise<GetRecurringOrdersResponse> {
    try {
      const url = `${this.baseUrl}/getRecurringOrders?user=${userAddress}&orderStatus=${orderStatus}&recurringType=${recurringType}&includeFailedTx=${includeFailedTx}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data: GetRecurringOrdersResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error getting recurring orders:", error);
      throw error;
    }
  }

  // Cancel an order
  async cancelOrder(
    userAddress: string,
    orderKey: string,
    recurringType: "time" | "price"
  ): Promise<CancelOrderResponse> {
    try {
      const requestBody = {
        order: orderKey,
        user: userAddress,
        recurringType,
      };

      const response = await fetch(`${this.baseUrl}/cancelOrder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data: CancelOrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error cancelling order:", error);
      throw error;
    }
  }

  // Execute order cancellation
  async executeCancelOrder(
    signedTransaction: string,
    requestId?: string
  ): Promise<ExecuteCancelOrderResponse> {
    try {
      const requestBody: any = {
        signedTransaction,
      };

      if (requestId) {
        requestBody.requestId = requestId;
      }

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

      const data: ExecuteCancelOrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error executing order cancellations:", error);
      throw error;
    }
  }
}

async function getAndCancelOrder() {
  const client = new RecurringApiClient();

  // Replace with your wallet address
  const walletAddress = "YOUR_WALLET_ADDRESS";

  try {
    // Step 1: Get active orders
    console.log("Step 1: Getting active orders...");
    const ordersResponse = await client.getRecurringOrders(
      walletAddress,
      "active",
      "all",
      true
    );

    let hasOrders = false;

    // Handle time-based orders
    if (ordersResponse.time) {
      let timeOrders: TimeBasedRecurringOrder[] = [];

      // Check if time is an array or has orders property
      if (Array.isArray(ordersResponse.time)) {
        timeOrders = ordersResponse.time;
      } else if (ordersResponse.time.orders) {
        timeOrders = ordersResponse.time.orders;
      }

      if (timeOrders.length > 0) {
        console.log(`Found ${timeOrders.length} active time-based orders`);
        hasOrders = true;

        // Get the first order to cancel
        const orderToCancel = timeOrders[0];
        console.log(`Cancelling time-based order: ${orderToCancel.orderKey}`);
        console.log(
          `Order details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
        );
        console.log(
          `Deposited amount: ${orderToCancel.inDeposited}, In used: ${orderToCancel.inUsed}`
        );

        // Step 2: Cancel the order
        console.log("\nStep 2: Cancelling order...");
        const cancelResponse = await client.cancelOrder(
          walletAddress,
          orderToCancel.orderKey,
          "time"
        );
        console.log("Cancel Order Response:");
        console.log(JSON.stringify(cancelResponse, null, 2));

        // Step 3: Execute the cancellation
        await executeCancellation(cancelResponse);
      }
    }

    // Handle price-based orders
    if (ordersResponse.price && !hasOrders) {
      let priceOrders: PriceBasedRecurringOrder[] = [];

      // Check if price is an array or has orders property
      if (Array.isArray(ordersResponse.price)) {
        priceOrders = ordersResponse.price;
      } else if (ordersResponse.price.orders) {
        priceOrders = ordersResponse.price.orders;
      }

      if (priceOrders.length > 0) {
        console.log(`Found ${priceOrders.length} active price-based orders`);
        hasOrders = true;

        // Get the first order to cancel
        const orderToCancel = priceOrders[0];
        console.log(`Cancelling price-based order: ${orderToCancel.orderKey}`);
        console.log(
          `Order details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
        );
        console.log(
          `Deposited amount: ${orderToCancel.inDeposited}, In used: ${orderToCancel.inUsed}`
        );

        // Step 2: Cancel the order
        console.log("\nStep 2: Cancelling order...");
        const cancelResponse = await client.cancelOrder(
          walletAddress,
          orderToCancel.orderKey,
          "price"
        );
        console.log("Cancel Order Response:");
        console.log(JSON.stringify(cancelResponse, null, 2));

        // Step 3: Execute the cancellation
        await executeCancellation(cancelResponse);
      }
    }

    // Handle "all" response format
    if (ordersResponse.all && !hasOrders && ordersResponse.all.length > 0) {
      console.log(`Found ${ordersResponse.all.length} active orders`);
      const allOrders = ordersResponse.all;
      hasOrders = true;

      // Get the first order to cancel
      const orderToCancel = allOrders[0];
      console.log(`Cancelling order: ${orderToCancel.orderKey}`);
      console.log(
        `Order details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
      );
      console.log(
        `Deposited amount: ${orderToCancel.inDeposited}, In used: ${orderToCancel.inUsed}`
      );

      // Determine recurringType
      const recurringType =
        (orderToCancel as any).recurringType ||
        (orderToCancel.cycleFrequency ? "time" : "price");

      // Step 2: Cancel the order
      console.log(`\nStep 2: Cancelling ${recurringType} order...`);
      const cancelResponse = await client.cancelOrder(
        walletAddress,
        orderToCancel.orderKey,
        recurringType as "time" | "price"
      );
      console.log("Cancel Order Response:");
      console.log(JSON.stringify(cancelResponse, null, 2));

      // Step 3: Execute the cancellation
      await executeCancellation(cancelResponse);
    }

    if (!hasOrders) {
      console.log("No active orders found to cancel.");
    }
  } catch (error) {
    console.error("Failed to get or cancel order:", error);
  }
}

async function getAndCancelMultipleOrders() {
  const client = new RecurringApiClient();

  // Replace with your wallet address
  const walletAddress = "YOUR_WALLET_ADDRESS";

  try {
    // Step 1: Get active orders
    console.log("Step 1: Getting active orders...");
    const ordersResponse = await client.getRecurringOrders(
      walletAddress,
      "active",
      "all",
      true
    );

    let hasOrders = false;

    // Process time-based orders
    if (ordersResponse.time) {
      let timeOrders: TimeBasedRecurringOrder[] = [];

      // Check if time is an array or has orders property
      if (Array.isArray(ordersResponse.time)) {
        timeOrders = ordersResponse.time;
      } else if (ordersResponse.time.orders) {
        timeOrders = ordersResponse.time.orders;
      }

      if (timeOrders.length > 0) {
        console.log(`Found ${timeOrders.length} active time-based orders`);
        hasOrders = true;

        for (let i = 0; i < timeOrders.length; i++) {
          const orderToCancel = timeOrders[i];
          console.log(
            `\nProcessing time-based order ${i + 1} of ${timeOrders.length}...`
          );
          console.log(`Order: ${orderToCancel.orderKey}`);
          console.log(
            `Details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
          );
          console.log(
            `Deposited amount: ${orderToCancel.inDeposited}, In used: ${orderToCancel.inUsed}`
          );

          // Step 2: Cancel the order
          console.log("Cancelling order...");
          const cancelResponse = await client.cancelOrder(
            walletAddress,
            orderToCancel.orderKey,
            "time"
          );
          console.log("Cancel Order Response:");
          console.log(JSON.stringify(cancelResponse, null, 2));

          // Step 3: Execute the cancellation
          await executeCancellation(cancelResponse);
        }
      }
    }

    // Process price-based orders
    if (ordersResponse.price) {
      let priceOrders: PriceBasedRecurringOrder[] = [];

      // Check if price is an array or has orders property
      if (Array.isArray(ordersResponse.price)) {
        priceOrders = ordersResponse.price;
      } else if (ordersResponse.price.orders) {
        priceOrders = ordersResponse.price.orders;
      }

      if (priceOrders.length > 0) {
        console.log(`\nFound ${priceOrders.length} active price-based orders`);
        hasOrders = true;

        for (let i = 0; i < priceOrders.length; i++) {
          const orderToCancel = priceOrders[i];
          console.log(
            `\nProcessing price-based order ${i + 1} of ${
              priceOrders.length
            }...`
          );
          console.log(`Order: ${orderToCancel.orderKey}`);
          console.log(
            `Details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
          );
          console.log(
            `Deposited amount: ${orderToCancel.inDeposited}, In used: ${orderToCancel.inUsed}`
          );

          // Step 2: Cancel the order
          console.log("Cancelling order...");
          const cancelResponse = await client.cancelOrder(
            walletAddress,
            orderToCancel.orderKey,
            "price"
          );
          console.log("Cancel Order Response:");
          console.log(JSON.stringify(cancelResponse, null, 2));

          // Step 3: Execute the cancellation
          await executeCancellation(cancelResponse);
        }
      }
    }

    // Process orders from "all" format
    if (ordersResponse.all && ordersResponse.all.length > 0) {
      const allOrders = ordersResponse.all;
      console.log(`\nFound ${allOrders.length} active orders`);
      hasOrders = true;

      for (let i = 0; i < allOrders.length; i++) {
        const orderToCancel = allOrders[i];
        console.log(`\nProcessing order ${i + 1} of ${allOrders.length}...`);
        console.log(`Order: ${orderToCancel.orderKey}`);
        console.log(
          `Details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
        );
        console.log(
          `Deposited amount: ${orderToCancel.inDeposited}, In used: ${orderToCancel.inUsed}`
        );

        // Determine recurringType
        const recurringType =
          (orderToCancel as any).recurringType ||
          (orderToCancel.cycleFrequency ? "time" : "price");

        // Step 2: Cancel the order
        console.log(`Cancelling ${recurringType} order...`);
        const cancelResponse = await client.cancelOrder(
          walletAddress,
          orderToCancel.orderKey,
          recurringType as "time" | "price"
        );
        console.log("Cancel Order Response:");
        console.log(JSON.stringify(cancelResponse, null, 2));

        // Step 3: Execute the cancellation
        await executeCancellation(cancelResponse);
      }
    }

    if (!hasOrders) {
      console.log("No active orders to cancel.");
    } else {
      console.log("\nAll cancellation transactions processed.");
    }
  } catch (error) {
    console.error("Failed to get or cancel multiple orders:", error);
  }
}

async function executeCancellation(cancelResponse: CancelOrderResponse) {
  const client = new RecurringApiClient();

  console.log("Step 3: Executing cancellation...");

  // Extract the transaction from the cancel response
  const transactionBase64 = cancelResponse.transaction;

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

  // Get request ID from the cancel response
  const requestId = cancelResponse.requestId;

  // Method 1: Execute cancellation via Jupiter API
  console.log("Executing cancellation via Jupiter API...");
  const executeResponse = await client.executeCancelOrder(
    signedTransaction,
    requestId
  );

  if (executeResponse.status === "Success") {
    console.log(
      `Order cancelled successfully: https://solscan.io/tx/${executeResponse.signature}`
    );
  } else {
    console.error(
      `Order cancellation failed: ${executeResponse.error}`,
      executeResponse
    );

    // Method 2: Send transaction yourself
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
      console.log(`Transaction successful: https://solscan.io/tx/${signature}`);
    }
  }
}

// this is for canceling a single order (the first order in the list)
getAndCancelOrder().catch(console.error);

// this is for canceling multiple orders (all orders in the list)
// getAndCancelMultipleOrders().catch(console.error);
