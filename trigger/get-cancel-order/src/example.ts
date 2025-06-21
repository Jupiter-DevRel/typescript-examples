import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
  "confirmed"
);

interface TriggerOrder {
  userPubkey: string;
  orderKey: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  remainingMakingAmount: string;
  remainingTakingAmount: string;
  status: string;
  [key: string]: any;
}

interface GetTriggerOrdersResponse {
  orders: TriggerOrder[];
  totalPages: number;
  page: number;
  user: string;
  orderStatus: string;
}

interface CancelOrderResponse {
  transaction: string;
  requestId: string;
}

interface CancelOrdersResponse {
  transactions: string[];
  requestId: string;
}

interface ExecuteCancelOrderResponse {
  signature?: string;
  status: "Success" | "Failed";
  error?: string;
  code?: number;
}

class TriggerApiClient {
  private readonly baseUrl: string = "https://lite-api.jup.ag/trigger/v1";

  // Get trigger orders
  async getTriggerOrders(
    userAddress: string,
    orderStatus: "active" | "history" = "active",
    page: number = 1
  ): Promise<GetTriggerOrdersResponse> {
    try {
      const url = `${this.baseUrl}/getTriggerOrders?user=${userAddress}&orderStatus=${orderStatus}&page=${page}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data: GetTriggerOrdersResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error getting trigger orders:", error);
      throw error;
    }
  }

  // Cancel an order
  async cancelOrder(
    makerAddress: string,
    orderKey: string,
    computeUnitPrice: "auto" | number = "auto"
  ): Promise<CancelOrderResponse> {
    try {
      const requestBody = {
        maker: makerAddress,
        order: orderKey,
        computeUnitPrice,
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

  // Cancel multiple orders
  async cancelOrders(
    makerAddress: string,
    orderKeys: string[],
    computeUnitPrice: "auto" | number = "auto"
  ): Promise<CancelOrdersResponse> {
    try {
      const requestBody = {
        maker: makerAddress,
        orders: orderKeys,
        computeUnitPrice,
      };

      const response = await fetch(`${this.baseUrl}/cancelOrders`, {
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

      const data: CancelOrdersResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error cancelling multiple orders:", error);
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
  const client = new TriggerApiClient();

  // Replace with your wallet address
  const walletAddress = "YOUR_WALLET_ADDRESS";

  try {
    // Step 1: Get active orders
    console.log("Step 1: Getting active orders...");
    const ordersResponse = await client.getTriggerOrders(
      walletAddress,
      "active"
    );
    console.log(`Found ${ordersResponse.orders.length} active orders`);

    if (ordersResponse.orders.length === 0) {
      console.log("No active orders to cancel.");
      return;
    }

    // Get the first order to cancel
    const orderToCancel = ordersResponse.orders[0];
    console.log(`Cancelling order: ${orderToCancel.orderKey}`);
    console.log(
      `Order details: ${orderToCancel.inputMint} -> ${orderToCancel.outputMint}`
    );
    console.log(
      `Making amount: ${orderToCancel.makingAmount}, Taking amount: ${orderToCancel.takingAmount}`
    );

    // Step 2: Cancel the order
    console.log("\nStep 2: Cancelling order...");
    const cancelResponse = await client.cancelOrder(
      walletAddress,
      orderToCancel.orderKey
    );
    console.log("Cancel Order Response:");
    console.log(JSON.stringify(cancelResponse, null, 2));

    // Step 3: Execute the cancellation
    console.log("\nStep 3: Executing cancellation...");

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
        console.log(
          `Transaction successful: https://solscan.io/tx/${signature}`
        );
      }
    }
  } catch (error) {
    console.error("Failed to get or cancel order:", error);
  }
}

async function getAndCancelMultipleOrders() {
  const client = new TriggerApiClient();

  // Replace with your wallet address
  const walletAddress = "YOUR_WALLET_ADDRESS";

  try {
    // Step 1: Get active orders
    console.log("Step 1: Getting active orders...");
    const ordersResponse = await client.getTriggerOrders(
      walletAddress,
      "active"
    );
    console.log(`Found ${ordersResponse.orders.length} active orders`);

    if (ordersResponse.orders.length === 0) {
      console.log("No active orders to cancel.");
      return;
    }

    // Get all order keys to cancel
    const orderKeysToCancel = ordersResponse.orders.map(
      (order) => order.orderKey
    );

    console.log(`Cancelling ${orderKeysToCancel.length} orders:`);
    orderKeysToCancel.forEach((orderKey, index) => {
      const order = ordersResponse.orders[index];
      console.log(`${index + 1}. Order: ${orderKey}`);
      console.log(`   Details: ${order.inputMint} -> ${order.outputMint}`);
      console.log(
        `   Making amount: ${order.makingAmount}, Taking amount: ${order.takingAmount}`
      );
    });

    // Step 2: Cancel multiple orders
    console.log("\nStep 2: Cancelling multiple orders...");
    const cancelResponse = await client.cancelOrders(
      walletAddress,
      orderKeysToCancel
    );
    console.log("Cancel Orders Response:");
    console.log(JSON.stringify(cancelResponse, null, 2));

    // Step 3: Execute the cancellations (one transaction at a time)
    console.log("\nStep 3: Executing order cancellations...");

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

    // Get request ID from the cancel response
    const requestId = cancelResponse.requestId;

    // Process each transaction in the response
    for (let i = 0; i < cancelResponse.transactions.length; i++) {
      console.log(
        `\nProcessing transaction ${i + 1} of ${
          cancelResponse.transactions.length
        }...`
      );

      const transactionBase64 = cancelResponse.transactions[i];

      // Deserialize the transaction
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(transactionBase64, "base64")
      );

      // Sign the transaction
      transaction.sign([wallet]);

      // Serialize the transaction to base64 format
      const signedTransaction = Buffer.from(transaction.serialize()).toString(
        "base64"
      );

      // Method 1: Execute cancellation via Jupiter API
      console.log("Executing cancellation via Jupiter API...");
      const executeResponse = await client.executeCancelOrder(
        signedTransaction,
        requestId
      );

      if (executeResponse.status === "Success") {
        console.log(
          `Transaction ${i + 1} executed successfully: https://solscan.io/tx/${
            executeResponse.signature
          }`
        );
      } else {
        console.error(
          `Transaction ${i + 1} execution failed: ${executeResponse.error}`,
          executeResponse
        );

        // Method 2: Send transaction yourself
        console.log("Trying to send transaction directly to Solana network...");
        const transactionBinary = transaction.serialize();

        const blockhashInfo = await connection.getLatestBlockhashAndContext({
          commitment: "finalized",
        });

        const signature = await connection.sendRawTransaction(
          transactionBinary,
          {
            maxRetries: 1,
            skipPreflight: true,
          }
        );

        const confirmation = await connection.confirmTransaction(
          {
            signature,
            blockhash: blockhashInfo.value.blockhash,
            lastValidBlockHeight: blockhashInfo.value.lastValidBlockHeight,
          },
          "finalized"
        );

        if (confirmation.value.err) {
          console.error(
            `Transaction ${i + 1} failed: ${JSON.stringify(
              confirmation.value.err
            )}\n\nhttps://solscan.io/tx/${signature}`
          );
        } else {
          console.log(
            `Transaction ${
              i + 1
            } successful: https://solscan.io/tx/${signature}`
          );
        }
      }
    }

    console.log("\nAll cancellation transactions processed.");
  } catch (error) {
    console.error("Failed to get or cancel multiple orders:", error);
  }
}

// this is for canceling a single order (the first order in the list)
getAndCancelOrder().catch(console.error);

// this is for canceling multiple orders (all orders in the list)
// getAndCancelMultipleOrders().catch(console.error);
