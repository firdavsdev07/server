/**
 * Migration: Add targetMonth to existing payments
 * 
 * Bu migration barcha mavjud to'lovlarga targetMonth fieldini qo'shadi
 */

import Payment, { PaymentType } from "../schemas/payment.schema";
import Contract from "../schemas/contract.schema";

async function addTargetMonthToPayments() {
  try {
    console.log("🚀 Starting migration: Add targetMonth to payments");

    // Barcha to'lovlarni olish
    const payments = await Payment.find({
      targetMonth: { $exists: false }, // targetMonth yo'q bo'lgan to'lovlar
    }).sort({ date: 1 });

    console.log(`📊 Found ${payments.length} payments without targetMonth`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const payment of payments) {
      try {
        // Contract topish
        const contract = await Contract.findOne({
          payments: payment._id,
        });

        if (!contract) {
          console.warn(`⚠️ Contract not found for payment ${payment._id}`);
          
          // Contract topilmasa, customer ID orqali qidirish
          const contractByCustomer = await Contract.findOne({
            customer: payment.customerId,
            status: "active",
          }).sort({ createdAt: -1 });

          if (!contractByCustomer) {
            console.error(`❌ No contract found for payment ${payment._id}`);
            errorCount++;
            continue;
          }

          // Contract topildi
          console.log(`✅ Found contract by customer for payment ${payment._id}`);
        }

        const activeContract = contract || await Contract.findOne({
          customer: payment.customerId,
          status: "active",
        }).sort({ createdAt: -1 });

        if (!activeContract) {
          errorCount++;
          continue;
        }

        // Shartnomadagi barcha to'lovlarni olish
        const allPayments = await Payment.find({
          _id: { $in: activeContract.payments },
          paymentType: PaymentType.MONTHLY,
        }).sort({ date: 1 });

        // Hozirgi to'lovning indexini topish
        const paymentIndex = allPayments.findIndex(
          (p) => p._id.toString() === payment._id.toString()
        );

        if (paymentIndex === -1) {
          console.warn(`⚠️ Payment ${payment._id} not found in contract payments`);
          // Agar topilmasa, sanasi bo'yicha hisoblash
          const contractStartDate = new Date(activeContract.startDate);
          const paymentDate = new Date(payment.date);
          
          const monthsDiff = 
            (paymentDate.getFullYear() - contractStartDate.getFullYear()) * 12 +
            (paymentDate.getMonth() - contractStartDate.getMonth());
          
          payment.targetMonth = Math.max(1, monthsDiff + 1);
        } else {
          // Index bo'yicha targetMonth ni aniqlash
          payment.targetMonth = paymentIndex + 1;
        }

        await payment.save();
        updatedCount++;

        console.log(`✅ Updated payment ${payment._id} with targetMonth: ${payment.targetMonth}`);
      } catch (error) {
        console.error(`❌ Error processing payment ${payment._id}:`, error);
        errorCount++;
      }
    }

    console.log("\n🎉 Migration completed!");
    console.log(`✅ Successfully updated: ${updatedCount} payments`);
    console.log(`❌ Errors: ${errorCount} payments`);

    return {
      success: true,
      updated: updatedCount,
      errors: errorCount,
    };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Agar to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  const mongoose = require("mongoose");
  
  // MongoDB connection
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nasiya";
  
  mongoose
    .connect(MONGODB_URI)
    .then(async () => {
      console.log("✅ Connected to MongoDB");
      await addTargetMonthToPayments();
      await mongoose.disconnect();
      console.log("✅ Disconnected from MongoDB");
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error("❌ MongoDB connection error:", error);
      process.exit(1);
    });
}

export default addTargetMonthToPayments;
