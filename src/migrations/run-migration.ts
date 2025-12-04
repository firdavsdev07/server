/**
 * Migration Runner
 *
 * Usage:
 *   npm run migrate:up    - Run all pending migrations
 *   npm run migrate:down  - Rollback last migration
 */

import mongoose from "mongoose";
import * as migration001 from "./001-add-payment-contract-fields";
import * as migration002 from "./002-add-payment-indexes";

interface Migration {
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

const migrations: Migration[] = [
  {
    name: "001-add-payment-contract-fields",
    up: migration001.up,
    down: migration001.down,
  },
  {
    name: "002-add-payment-indexes",
    up: migration002.up,
    down: migration002.down,
  },
];

async function runMigrations(direction: "up" | "down" = "up"): Promise<void> {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGO_URI || "mongodb://localhost:27017/your-db";
    await mongoose.connect(mongoUri);
    console.log("📦 Connected to MongoDB");

    if (direction === "up") {
      console.log(`\n🚀 Running ${migrations.length} migration(s)...\n`);

      for (const migration of migrations) {
        console.log(`▶️  Running migration: ${migration.name}`);
        await migration.up();
        console.log(`✅ Completed migration: ${migration.name}\n`);
      }

      console.log("🎉 All migrations completed successfully!");
    } else {
      console.log(`\n⏪ Rolling back ${migrations.length} migration(s)...\n`);

      // Run rollbacks in reverse order
      for (const migration of [...migrations].reverse()) {
        console.log(`▶️  Rolling back migration: ${migration.name}`);
        await migration.down();
        console.log(`✅ Rolled back migration: ${migration.name}\n`);
      }

      console.log("🎉 All rollbacks completed successfully!");
    }

    // Disconnect
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration execution failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Parse command line arguments
const direction = process.argv[2] === "down" ? "down" : "up";
runMigrations(direction);
