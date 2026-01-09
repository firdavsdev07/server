/**
 * Migration: Mavjud mijozlar va to'lovlarga customerId va paymentId qo'shish
 * 
 * Bu migration:
 * 1. Barcha mavjud mijozlarga customerId (1001, 1002, ...) qo'shadi
 * 2. Barcha mavjud to'lovlarga paymentId (P-0001, P-0002, ...) qo'shadi
 * 3. Counter collection'ni to'g'ri qiymatga sozlaydi
 */

import mongoose from "mongoose";
import Customer from "../schemas/customer.schema";
import Payment from "../schemas/payment.schema";
import Counter from "../schemas/counter.schema";
import logger from "../utils/logger";

export async function up() {
    logger.info("🚀 Starting migration: Add custom IDs to customers and payments");

    // 1. Mijozlarga customerId qo'shish
    const customers = await Customer.find({ customerId: { $exists: false } }).sort({ createdAt: 1 });
    logger.info(`📋 Found ${customers.length} customers without customerId`);

    let customerCounter = 0;
    for (const customer of customers) {
        customerCounter++;
        const customerId = 1000 + customerCounter;
        await Customer.updateOne(
            { _id: customer._id },
            { $set: { customerId } }
        );
        logger.debug(`  ✓ Customer ${customer.fullName} -> ID: ${customerId}`);
    }

    // Counter'ni yangilash
    await Counter.findOneAndUpdate(
        { name: "customer" },
        { $set: { value: customerCounter } },
        { upsert: true }
    );
    logger.info(`✅ Updated ${customerCounter} customers with customerId`);

    // 2. To'lovlarga paymentId qo'shish
    const payments = await Payment.find({ paymentId: { $exists: false } }).sort({ createdAt: 1 });
    logger.info(`📋 Found ${payments.length} payments without paymentId`);

    let paymentCounter = 0;
    for (const payment of payments) {
        paymentCounter++;
        const paymentId = `P-${String(paymentCounter).padStart(4, "0")}`;
        await Payment.updateOne(
            { _id: payment._id },
            { $set: { paymentId } }
        );
        logger.debug(`  ✓ Payment ${payment._id} -> ID: ${paymentId}`);
    }

    // Counter'ni yangilash
    await Counter.findOneAndUpdate(
        { name: "payment" },
        { $set: { value: paymentCounter } },
        { upsert: true }
    );
    logger.info(`✅ Updated ${paymentCounter} payments with paymentId`);

    logger.info("🎉 Migration completed successfully!");
    return { customersUpdated: customerCounter, paymentsUpdated: paymentCounter };
}

export async function down() {
    logger.info("🔄 Rolling back migration: Remove custom IDs");

    // customerId va paymentId larni o'chirish
    await Customer.updateMany({}, { $unset: { customerId: 1 } });
    await Payment.updateMany({}, { $unset: { paymentId: 1 } });

    // Counter'larni o'chirish
    await Counter.deleteMany({ name: { $in: ["customer", "payment"] } });

    logger.info("✅ Rollback completed");
}

// CLI dan ishga tushirish uchun
if (require.main === module) {
    const dotenv = require("dotenv");
    dotenv.config();

    mongoose
        .connect(process.env.MONGO_DB!)
        .then(async () => {
            logger.info("📦 Connected to MongoDB");
            await up();
            process.exit(0);
        })
        .catch((err) => {
            logger.error("❌ Migration failed:", err);
            process.exit(1);
        });
}
