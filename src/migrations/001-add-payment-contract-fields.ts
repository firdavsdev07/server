/**
 * Migration: Add new fields to Payment and Contract schemas
 *
 * This migration adds the following fields:
 *
 * Payment Schema:
 * - linkedPaymentId: Reference to linked payment
 * - reason: Reason for payment (PaymentReason enum)
 * - prepaidAmount: Prepaid amount from previous month
 * - appliedToPaymentId: Payment where excess was applied
 *
 * Contract Schema:
 * - prepaidBalance: Prepaid balance amount
 * - editHistory: Array of contract edit records
 *
 * Date: 2025-01-XX
 */

import mongoose from "mongoose";
import Payment from "../schemas/payment.schema";
import Contract from "../schemas/contract.schema";

export async function up(): Promise<void> {

  try {
    const paymentUpdateResult = await Payment.updateMany(
      {
        linkedPaymentId: { $exists: false },
      },
      {
        $set: {
          linkedPaymentId: null,
          reason: null,
          prepaidAmount: 0,
          appliedToPaymentId: null,
        },
      }
    );


    const contractUpdateResult = await Contract.updateMany(
      {
        prepaidBalance: { $exists: false },
      },
      {
        $set: {
          prepaidBalance: 0,
          editHistory: [],
        },
      }
    );


    console.log("Migration completed successfully!");
  } catch (error) {
    console.error(" Migration failed:", error);
    throw error;
  }
}

export async function down(): Promise<void> {


  try {
    const paymentRollbackResult = await Payment.updateMany(
      {},
      {
        $unset: {
          linkedPaymentId: "",
          reason: "",
          prepaidAmount: "",
          appliedToPaymentId: "",
        },
      }
    );

    const contractRollbackResult = await Contract.updateMany(
      {},
      {
        $unset: {
          prepaidBalance: "",
          editHistory: "",
        },
      }
    );

 

    console.log(" Rollback completed successfully!");
  } catch (error) {
    console.error(" Rollback failed:", error);
    throw error;
  }
}

if (require.main === module) {
  const runMigration = async () => {
    try {
      const mongoUri =
        process.env.MONGO_URI || "mongodb://localhost:27017/your-db";
      await mongoose.connect(mongoUri);
      console.log("Connected to MongoDB");

      await up();

      // Disconnect
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB");
      process.exit(0);
    } catch (error) {
      console.error("Migration execution failed:", error);
      process.exit(1);
    }
  };

  runMigration();
}
