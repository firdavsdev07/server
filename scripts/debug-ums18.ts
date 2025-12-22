/**
 * Debug skript: UMS18 test mijoz uchun qarzdorlik kunlarini tekshirish
 * 
 * Ishlatish: npx ts-node scripts/debug-ums18.ts
 */

import "dotenv/config";
import mongoose from "mongoose";
import Contract, { ContractStatus } from "../src/schemas/contract.schema";
import Payment from "../src/schemas/payment.schema";
import Customer from "../src/schemas/customer.schema";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nasiya_db";

async function debugUMS18() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB connected");

        // UMS18 test mijozini topish
        const customer = await Customer.findOne({
            $or: [
                { firstName: { $regex: /UMS18/i } },
                { lastName: { $regex: /UMS18/i } },
            ]
        });

        if (!customer) {
            console.log("❌ UMS18 test mijoz topilmadi");

            // Boshqa mijozlarni ko'rish
            const allCustomers = await Customer.find({}).select("firstName lastName phoneNumber");
            console.log("📋 Mavjud mijozlar soni:", allCustomers.length);
            allCustomers.forEach((c, i) => {
                console.log(`   ${i + 1}. ${c.firstName} ${c.lastName || ""} - ${c.phoneNumber || "N/A"}`);
            });

            await mongoose.disconnect();
            return;
        }

        console.log(`\n📋 Mijoz topildi: ${customer.firstName} ${customer.lastName}`);
        console.log(`   ID: ${customer._id}`);

        // Mijozning faol shartnomalarini topish
        const contracts = await Contract.find({
            customer: customer._id,
            isActive: true,
            isDeleted: false,
            status: ContractStatus.ACTIVE,
        }).populate("payments");

        console.log(`\n📑 Faol shartnomalar soni: ${contracts.length}`);

        for (const contract of contracts) {
            console.log(`\n════════════════════════════════════════════`);
            console.log(`📦 Shartnoma: ${contract.productName}`);
            console.log(`   ID: ${contract._id}`);
            console.log(`   Start Date: ${contract.startDate?.toISOString().split("T")[0]}`);
            console.log(`   Next Payment Date: ${contract.nextPaymentDate?.toISOString().split("T")[0]}`);
            console.log(`   Original Payment Day: ${contract.originalPaymentDay}`);
            console.log(`   Total Price: ${contract.totalPrice} $`);
            console.log(`   Monthly Payment: ${contract.monthlyPayment} $`);
            console.log(`   Period: ${contract.period} oy`);

            // To'lovlarni ko'rish - contract.payments dan
            const payments = await Payment.find({
                _id: { $in: contract.payments }
            }).sort({ targetMonth: 1 });

            // Barcha to'lovlarni customer ID bo'yicha ham olish
            const allPaymentsForCustomer = await Payment.find({
                customerId: customer._id
            }).sort({ date: 1 });

            console.log(`\n   📊 Contract to'lovlar (${payments.length} ta):`);
            console.log(`   📊 Customer to'lovlar (${allPaymentsForCustomer.length} ta):`);

            console.log(`\n   📊 To'lovlar (${payments.length} ta):`);
            console.log(`   ${"─".repeat(90)}`);
            console.log(`   | # | Target | Belgilangan sana | To'langan sana | isPaid | Status     | Amount |`);
            console.log(`   ${"─".repeat(90)}`);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let overdueUnpaidPayments = [];

            for (let i = 0; i < payments.length; i++) {
                const p = payments[i];
                const payDate = new Date(p.date);
                const isOverdue = payDate < today && !p.isPaid;

                if (isOverdue) {
                    overdueUnpaidPayments.push(p);
                }

                const confirmedDate = p.confirmedAt
                    ? new Date(p.confirmedAt).toISOString().split("T")[0]
                    : "—";

                const statusColor = p.isPaid ? "✅" : (isOverdue ? "🔴" : "⏳");

                console.log(
                    `   | ${String(i + 1).padStart(2)} | ${String(p.targetMonth || "?").padStart(6)} | ${payDate.toISOString().split("T")[0].padStart(16)} | ${confirmedDate.padStart(14)} | ${p.isPaid ? " true " : "false "} | ${String(p.status || "N/A").padStart(10)} | ${String(p.amount).padStart(6)} |  ${statusColor}`
                );
            }
            console.log(`   ${"─".repeat(90)}`);

            // Kechikkan kunlarni hisoblash
            console.log(`\n   📊 Kechikkan kunlar tahlili:`);
            console.log(`   Bugungi sana: ${today.toISOString().split("T")[0]}`);
            console.log(`   Muddati o'tgan to'lanmagan to'lovlar: ${overdueUnpaidPayments.length} ta`);

            if (overdueUnpaidPayments.length > 0) {
                const firstOverdue = overdueUnpaidPayments[0];
                const firstOverdueDate = new Date(firstOverdue.date);
                const delayDays = Math.floor(
                    (today.getTime() - firstOverdueDate.getTime()) / (1000 * 60 * 60 * 24)
                );

                console.log(`   Eng birinchi kechikkan to'lov sanasi: ${firstOverdueDate.toISOString().split("T")[0]}`);
                console.log(`   Hisoblangan kechikkan kunlar: ${delayDays} kun`);
            } else {
                console.log(`   ✅ Hech qanday muddati o'tgan to'lanmagan to'lov yo'q`);

                // nextPaymentDate tekshirish
                if (contract.nextPaymentDate && contract.nextPaymentDate < today) {
                    const delayFromNext = Math.floor(
                        (today.getTime() - contract.nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    console.log(`   ⚠️ Lekin nextPaymentDate (${contract.nextPaymentDate.toISOString().split("T")[0]}) o'tib ketgan!`);
                    console.log(`   ⚠️ nextPaymentDate dan kechikkan kunlar: ${delayFromNext} kun`);
                }
            }
        }

        console.log(`\n════════════════════════════════════════════`);
        console.log(`\n✅ Debug tugadi`);

    } catch (error) {
        console.error("❌ Xato:", error);
    } finally {
        await mongoose.disconnect();
    }
}

debugUMS18();
