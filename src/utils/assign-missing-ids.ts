/**
 * Server ishga tushganda avtomatik ID berish
 * Mavjud mijozlar va to'lovlarga customerId/paymentId qo'shadi
 */

import Customer from "../schemas/customer.schema";
import Payment from "../schemas/payment.schema";
import Counter from "../schemas/counter.schema";
import logger from "./logger";

export async function assignMissingIds() {
    try {
        // 1. customerId yo'q mijozlarni tekshirish
        const customersWithoutId = await Customer.countDocuments({
            $or: [{ customerId: { $exists: false } }, { customerId: null }],
        });

        if (customersWithoutId > 0) {
            logger.info(`📋 ${customersWithoutId} ta mijozga customerId berilmoqda...`);

            // Hozirgi counter qiymatini olish
            let counter = await Counter.findOne({ name: "customer" });
            let currentValue = counter?.value || 0;

            // ID yo'q mijozlarni olish (yaratilgan vaqti bo'yicha)
            const customers = await Customer.find({
                $or: [{ customerId: { $exists: false } }, { customerId: null }],
            }).sort({ createdAt: 1 });

            for (const customer of customers) {
                currentValue++;
                const customerId = 1000 + currentValue;
                await Customer.updateOne(
                    { _id: customer._id },
                    { $set: { customerId } }
                );
            }

            // Counter ni yangilash
            await Counter.findOneAndUpdate(
                { name: "customer" },
                { $set: { value: currentValue } },
                { upsert: true }
            );

            logger.info(`✅ ${customersWithoutId} ta mijozga customerId berildi`);
        }

        // 2. paymentId yo'q to'lovlarni tekshirish
        const paymentsWithoutId = await Payment.countDocuments({
            $or: [{ paymentId: { $exists: false } }, { paymentId: null }],
        });

        if (paymentsWithoutId > 0) {
            logger.info(`📋 ${paymentsWithoutId} ta to'lovga paymentId berilmoqda...`);

            // Hozirgi counter qiymatini olish
            let counter = await Counter.findOne({ name: "payment" });
            let currentValue = counter?.value || 0;

            // ID yo'q to'lovlarni olish (yaratilgan vaqti bo'yicha)
            const payments = await Payment.find({
                $or: [{ paymentId: { $exists: false } }, { paymentId: null }],
            }).sort({ createdAt: 1 });

            for (const payment of payments) {
                currentValue++;
                const paymentId = `P-${String(currentValue).padStart(4, "0")}`;
                await Payment.updateOne(
                    { _id: payment._id },
                    { $set: { paymentId } }
                );
            }

            // Counter ni yangilash
            await Counter.findOneAndUpdate(
                { name: "payment" },
                { $set: { value: currentValue } },
                { upsert: true }
            );

            logger.info(`✅ ${paymentsWithoutId} ta to'lovga paymentId berildi`);
        }

        if (customersWithoutId === 0 && paymentsWithoutId === 0) {
            logger.debug("✅ Barcha mijoz va to'lovlarda ID mavjud");
        }
    } catch (error) {
        logger.error("❌ ID berish xatosi:", error);
    }
}
