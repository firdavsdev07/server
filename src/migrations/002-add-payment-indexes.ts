/**
 * Migration: Add indexes to Payment schema for performance optimization
 *
 * This migration adds the following indexes:
 *
 * Payment Schema:
 * - Compound index on isPaid and status (for pending payments query)
 * - Index on date field (for sorting and date-based queries)
 *
 * These indexes optimize the getPendingPayments query which filters by
 * isPaid: false and status: PENDING, and sorts by date.
 *
 * Date: 2025-01-09
 */

import mongoose from "mongoose";
import Payment from "../schemas/payment.schema";

export async function up(): Promise<void> {
  console.log("🔄 Starting migration: Add Payment indexes...");

  try {
    const collection = Payment.collection;

    // Create compound index on isPaid and status
    console.log("📊 Creating compound index on isPaid and status...");
    await collection.createIndex(
      { isPaid: 1, status: 1 },
      {
        name: "idx_isPaid_status",
        background: true,
      }
    );
    console.log("✅ Created compound index: idx_isPaid_status");

    // Create index on date field
    console.log("📊 Creating index on date...");
    await collection.createIndex(
      { date: -1 },
      {
        name: "idx_date",
        background: true,
      }
    );
    console.log("✅ Created index: idx_date");

    // List all indexes to verify
    const indexes = await collection.indexes();
    console.log("\n📋 Current indexes on Payment collection:");
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log("\n🎉 Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

export async function down(): Promise<void> {
  console.log("🔄 Rolling back migration: Remove Payment indexes...");

  try {
    const collection = Payment.collection;

    // Drop compound index on isPaid and status
    console.log("🗑️  Dropping compound index on isPaid and status...");
    try {
      await collection.dropIndex("idx_isPaid_status");
      console.log("✅ Dropped index: idx_isPaid_status");
    } catch (error: any) {
      if (error.code === 27) {
        console.log("⚠️  Index idx_isPaid_status does not exist, skipping...");
      } else {
        throw error;
      }
    }

    // Drop index on date field
    console.log("🗑️  Dropping index on date...");
    try {
      await collection.dropIndex("idx_date");
      console.log("✅ Dropped index: idx_date");
    } catch (error: any) {
      if (error.code === 27) {
        console.log("⚠️  Index idx_date does not exist, skipping...");
      } else {
        throw error;
      }
    }

    // List all indexes to verify
    const indexes = await collection.indexes();
    console.log("\n📋 Current indexes on Payment collection:");
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log("\n🎉 Rollback completed successfully!");
  } catch (error) {
    console.error("❌ Rollback failed:", error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  const runMigration = async () => {
    try {
      // Connect to MongoDB
      const mongoUri =
        process.env.MONGO_URI || "mongodb://localhost:27017/your-db";
      await mongoose.connect(mongoUri);
      console.log("📦 Connected to MongoDB");

      // Check command line argument for direction
      const direction = process.argv[2];

      if (direction === "down") {
        await down();
      } else {
        await up();
      }

      // Disconnect
      await mongoose.disconnect();
      console.log("👋 Disconnected from MongoDB");
      process.exit(0);
    } catch (error) {
      console.error("❌ Migration execution failed:", error);
      process.exit(1);
    }
  };

  runMigration();
}
