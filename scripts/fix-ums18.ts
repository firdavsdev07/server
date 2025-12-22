/**
 * Data fix skript: UMS18 test shartnomani tuzatish
 * 
 * Muammo: nextPaymentDate yangilanmagan (2025-09-17 da qolib ketgan)
 * To'lovlar: 1-5 oy to'langan, 6-oy to'lanmagan
 * 
 * Yechim: 
 * 1. nextPaymentDate ni 2025-12-18 ga o'zgartirish (6-oy)
 * 2. originalPaymentDay ni 18 ga o'rnatish
 * 3. Payment'larning date'larini to'g'rilash
 * 
 * Ishlatish: npx ts-node-dev --transpile-only scripts/fix-ums18.ts
 */

import "dotenv/config";
import mongoose from "mongoose";
import Contract, { ContractStatus } from "../src/schemas/contract.schema";
import Payment from "../src/schemas/payment.schema";
import Customer from "../src/schemas/customer.schema";

const MONGODB_URI = "mongodb://localhost:27017/nasiya_db";

async function fixUMS18() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB connected to:", MONGODB_URI);

        // UMS18 test mijozini topish
        const customer = await Customer.findOne({
            firstName: { $regex: /UMS18/i }
        });

        if (!customer) {
            console.log("❌ UMS18 test mijoz topilmadi");
            await mongoose.disconnect();
            return;
        }

        console.log(`\n📋 Mijoz topildi: ${customer.firstName} ${customer.lastName}`);

        // Shartnomani topish
        const contract = await Contract.findOne({
            customer: customer._id,
            isActive: true,
            isDeleted: false,
            status: ContractStatus.ACTIVE,
        });

        if (!contract) {
            console.log("❌ Faol shartnoma topilmadi");
            await mongoose.disconnect();
            return;
        }

        console.log(`📦 Shartnoma topildi: ${contract.productName}`);
        console.log(`   Hozirgi nextPaymentDate: ${contract.nextPaymentDate?.toISOString().split("T")[0]}`);

        // To'lovlarni olish
        const payments = await Payment.find({
            _id: { $in: contract.payments }
        }).sort({ targetMonth: 1 });

        console.log(`\n📊 To'lovlar (${payments.length} ta):`);

        // Eng oxirgi to'langan oyni topish
        const paidPayments = payments.filter(p => p.isPaid);
        const lastPaidMonth = Math.max(...paidPayments.map(p => p.targetMonth || 0));

        console.log(`   Eng oxirgi to'langan oy: ${lastPaidMonth}`);

        // Keyingi to'lov oyi
        const nextPaymentMonth = lastPaidMonth + 1;
        console.log(`   Keyingi to'lov oyi: ${nextPaymentMonth}`);

        // startDate dan originalPaymentDay ni aniqlash
        const startDate = new Date(contract.startDate);
        const originalPaymentDay = startDate.getDate(); // 17 yoki 18
        console.log(`   Start date: ${startDate.toISOString().split("T")[0]}`);
        console.log(`   Original payment day: ${originalPaymentDay}`);

        // Yangi nextPaymentDate hisoblash
        // startDate = 2025-06-17, period = 12 oy
        // 1-oy: 2025-07-17
        // 2-oy: 2025-08-17
        // ...
        // 6-oy: 2025-12-17
        const newNextPaymentDate = new Date(startDate);
        newNextPaymentDate.setMonth(startDate.getMonth() + nextPaymentMonth);

        console.log(`   Yangi nextPaymentDate: ${newNextPaymentDate.toISOString().split("T")[0]}`);

        // DRY RUN - o'zgarishlarni ko'rsatish
        console.log(`\n🔧 O'zgarishlar:`);
        console.log(`   nextPaymentDate: ${contract.nextPaymentDate?.toISOString().split("T")[0]} → ${newNextPaymentDate.toISOString().split("T")[0]}`);
        console.log(`   originalPaymentDay: ${contract.originalPaymentDay} → ${originalPaymentDay}`);

        // Payment date'larni tuzatish
        console.log(`\n📊 Payment date'larni tuzatish:`);
        for (const payment of payments) {
            const correctDate = new Date(startDate);
            correctDate.setMonth(startDate.getMonth() + (payment.targetMonth || 0));

            const currentDate = new Date(payment.date).toISOString().split("T")[0];
            const newDate = correctDate.toISOString().split("T")[0];

            if (currentDate !== newDate) {
                console.log(`   ${payment.targetMonth}-oy: ${currentDate} → ${newDate} ${payment.isPaid ? '(to\'langan)' : '(to\'lanmagan)'}`);
            }
        }

        // Foydalanuvchi tasdig'ini so'rash
        console.log(`\n⚠️ O'zgarishlarni qo'llash uchun --apply flag qo'shing`);
        console.log(`   npx ts-node-dev --transpile-only scripts/fix-ums18.ts --apply`);

        if (process.argv.includes("--apply")) {
            console.log(`\n🔧 O'zgarishlar qo'llanmoqda...`);

            // Contract yangilash
            contract.nextPaymentDate = newNextPaymentDate;
            contract.originalPaymentDay = originalPaymentDay;
            await contract.save();
            console.log(`   ✅ Contract yangilandi`);

            // Payment date'larni tuzatish
            for (const payment of payments) {
                const correctDate = new Date(startDate);
                correctDate.setMonth(startDate.getMonth() + (payment.targetMonth || 0));

                if (payment.date.toISOString().split("T")[0] !== correctDate.toISOString().split("T")[0]) {
                    payment.date = correctDate;
                    await payment.save();
                    console.log(`   ✅ ${payment.targetMonth}-oy payment date yangilandi: ${correctDate.toISOString().split("T")[0]}`);
                }
            }

            console.log(`\n✅ Barcha o'zgarishlar qo'llandi!`);
        }

    } catch (error) {
        console.error("❌ Xato:", error);
    } finally {
        await mongoose.disconnect();
    }
}

fixUMS18();
