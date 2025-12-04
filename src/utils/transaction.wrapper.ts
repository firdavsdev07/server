/**
 * Transaction Wrapper Utility
 * 
 * MongoDB Transaction support with fallback for development
 * 
 * Usage:
 *   await withTransaction(async (session) => {
 *     await Model1.create([data], { session });
 *     await Model2.findByIdAndUpdate(id, update, { session });
 *   });
 * 
 * Environment:
 *   - MONGODB_REPLICA_SET=true  - Enable transactions (Production)
 *   - MONGODB_REPLICA_SET=false - Disable transactions (Development)
 */

import mongoose, { ClientSession } from "mongoose";
import logger from "./logger";

/**
 * Check if MongoDB Replica Set is available
 */
const isReplicaSetEnabled = (): boolean => {
  const replicaSetEnv = process.env.MONGODB_REPLICA_SET;
  return replicaSetEnv === "true";
};

/**
 * Execute operation with transaction support
 * 
 * @param operation - Async function that performs database operations
 * @returns Result of the operation
 * 
 * @example
 * const result = await withTransaction(async (session) => {
 *   const payment = await Payment.create([paymentData], { session });
 *   const contract = await Contract.findByIdAndUpdate(id, update, { session });
 *   return { payment, contract };
 * });
 */
export async function withTransaction<T>(
  operation: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  // Development mode - no transaction
  if (!isReplicaSetEnabled()) {
    logger.debug("📝 Running without transaction (standalone MongoDB)");
    return await operation(null);
  }

  // Production mode - with transaction
  logger.debug("🔒 Starting transaction (Replica Set)");
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await operation(session);
    await session.commitTransaction();
    logger.debug("✅ Transaction committed successfully");
    return result;
  } catch (error) {
    await session.abortTransaction();
    logger.error("❌ Transaction aborted due to error:", error);
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Execute multiple operations in a single transaction
 * 
 * @param operations - Array of async functions
 * @returns Array of results
 * 
 * @example
 * const [payment, contract, balance] = await withTransactionBatch([
 *   (session) => Payment.create([data], { session }),
 *   (session) => Contract.findByIdAndUpdate(id, update, { session }),
 *   (session) => Balance.findOneAndUpdate(query, update, { session })
 * ]);
 */
export async function withTransactionBatch<T extends any[]>(
  operations: Array<(session: ClientSession | null) => Promise<any>>
): Promise<T> {
  return withTransaction(async (session) => {
    const results = [];
    for (const operation of operations) {
      const result = await operation(session);
      results.push(result);
    }
    return results as T;
  });
}

/**
 * Retry transaction on specific errors (e.g., TransientTransactionError)
 * 
 * @param operation - Operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Result of the operation
 */
export async function withTransactionRetry<T>(
  operation: (session: ClientSession | null) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(operation);
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = 
        error.hasErrorLabel?.("TransientTransactionError") ||
        error.hasErrorLabel?.("UnknownTransactionCommitResult");
      
      if (!isRetryable || attempt === maxRetries) {
        break;
      }
      
      logger.warn(`⚠️ Transaction failed (attempt ${attempt}/${maxRetries}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Exponential backoff
    }
  }
  
  throw lastError;
}

export default withTransaction;
