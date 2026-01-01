import mongoose from "mongoose";
import Payment from "../schemas/payment.schema";

export async function up(): Promise<void> {
  try {
    const collection = Payment.collection;

    await collection.createIndex(
      { isPaid: 1, status: 1 },
      {
        name: "idx_isPaid_status",
        background: true,
      }
    );

    await collection.createIndex(
      { date: -1 },
      {
        name: "idx_date",
        background: true,
      }
    );

    // List all indexes to verify
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

export async function down(): Promise<void> {
  try {
    const collection = Payment.collection;

    try {
      await collection.dropIndex("idx_isPaid_status");
    } catch (error: any) {
      if (error.code === 27) {
        console.log("  Index idx_isPaid_status does not exist, skipping...");
      } else {
        throw error;
      }
    }

    try {
      await collection.dropIndex("idx_date");
    } catch (error: any) {
      if (error.code === 27) {
      } else {
        throw error;
      }
    }

    // List all indexes to verify
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });
  } catch (error) {
    throw error;
  }
}

if (require.main === module) {
  const runMigration = async () => {
    try {
      // Connect to MongoDB
      const mongoUri =
        process.env.MONGO_URI || "mongodb://localhost:27017/your-db";
      await mongoose.connect(mongoUri);

      const direction = process.argv[2];

      if (direction === "down") {
        await down();
      } else {
        await up();
      }

      // Disconnect
      await mongoose.disconnect();
      console.log(" Disconnected from MongoDB");
      process.exit(0);
    } catch (error) {
      console.error(" Migration execution failed:", error);
      process.exit(1);
    }
  };

  runMigration();
}
