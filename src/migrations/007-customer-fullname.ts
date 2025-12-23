import mongoose from "mongoose";
import Customer from "../schemas/customer.schema";
import logger from "../utils/logger";

/**
 * Migration: Combine firstName and lastName into fullName
 * This migration combines existing firstName and lastName fields into a single fullName field
 */

export async function up() {
  logger.info("🔄 Starting migration: 007-customer-fullname (UP)");

  try {
    const customers = await Customer.find({});
    logger.info(`📊 Found ${customers.length} customers to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const customer of customers) {
      try {
        // Check if customer has old firstName/lastName fields
        const customerDoc = customer.toObject() as any;
        
        if (customerDoc.firstName !== undefined || customerDoc.lastName !== undefined) {
          const firstName = customerDoc.firstName || "";
          const lastName = customerDoc.lastName || "";
          const fullName = `${firstName} ${lastName}`.trim();

          // Update to new fullName field
          await Customer.updateOne(
            { _id: customer._id },
            {
              $set: { fullName: fullName },
              $unset: { firstName: "", lastName: "" }
            }
          );

          migratedCount++;
          
          if (migratedCount % 100 === 0) {
            logger.info(`✅ Migrated ${migratedCount} customers...`);
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        logger.error(`❌ Error migrating customer ${customer._id}:`, error);
      }
    }

    logger.info(`✅ Migration completed successfully`);
    logger.info(`📊 Migrated: ${migratedCount}, Skipped: ${skippedCount}`);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    throw error;
  }
}

export async function down() {
  logger.info("🔄 Starting migration: 007-customer-fullname (DOWN)");

  try {
    const customers = await Customer.find({});
    logger.info(`📊 Found ${customers.length} customers to rollback`);

    let rolledBackCount = 0;

    for (const customer of customers) {
      try {
        const customerDoc = customer.toObject() as any;
        
        if (customerDoc.fullName) {
          // Split fullName back into firstName and lastName
          const nameParts = customerDoc.fullName.trim().split(/\s+/);
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";

          await Customer.updateOne(
            { _id: customer._id },
            {
              $set: { firstName, lastName },
              $unset: { fullName: "" }
            }
          );

          rolledBackCount++;
          
          if (rolledBackCount % 100 === 0) {
            logger.info(`✅ Rolled back ${rolledBackCount} customers...`);
          }
        }
      } catch (error) {
        logger.error(`❌ Error rolling back customer ${customer._id}:`, error);
      }
    }

    logger.info(`✅ Rollback completed successfully`);
    logger.info(`📊 Rolled back: ${rolledBackCount} customers`);
  } catch (error) {
    logger.error("❌ Rollback failed:", error);
    throw error;
  }
}
