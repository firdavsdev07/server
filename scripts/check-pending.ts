import "dotenv/config";
import mongoose from "mongoose";
import Payment, { PaymentStatus } from "../src/schemas/payment.schema";

const MONGODB_URI = "mongodb://localhost:27017/nasiya_db";

async function checkPending() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB connected");

    const pendingPayments = await Payment.find({ status: PaymentStatus.PENDING }).sort({ createdAt: -1 });
    console.log(`\n📊 PENDING to'lovlar: ${pendingPayments.length}`);

    pendingPayments.forEach((p, i) => {
        console.log(`   ${i + 1}. Customer: ${p.customerId}, Amount: ${p.amount}$, Target: ${p.targetMonth}-oy, Created: ${p.createdAt}`);
    });

    const allPayments = await Payment.find({}).sort({ createdAt: -1 }).limit(20);
    console.log(`\n📊 Oxirgi 20 ta to'lov:`);
    allPayments.forEach((p, i) => {
        console.log(`   ${i + 1}. Status: ${p.status}, isPaid: ${p.isPaid}, Amount: ${p.amount}$, Target: ${p.targetMonth}-oy`);
    });

    await mongoose.disconnect();
}

checkPending();
