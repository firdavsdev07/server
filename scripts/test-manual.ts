import "dotenv/config";
import mongoose from "mongoose";
import Customer from "../src/schemas/customer.schema";
import Contract, { ContractStatus } from "../src/schemas/contract.schema";
import Payment, { PaymentType } from "../src/schemas/payment.schema";
import paymentService from "../src/dashboard/services/payment.service";
import Auth from "../src/schemas/auth.schema";

const MONGODB_URI = "mongodb://localhost:27017/nasiya_db";

async function testManualWorkFlow() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB connected");

        // 1. Yangi test mijoz yaratish
        const auth = await Auth.create({});
        const customer = await Customer.create({
            firstName: "Qo'lda",
            lastName: "Ochilgan",
            phoneNumber: "998901234567",
            manager: new mongoose.Types.ObjectId("69401160fc16f05cb6f5241f"), // Mavjud manager ID
            auth: auth._id
        });
        console.log("👤 Mijoz yaratildi:", customer.firstName);

        // 2. Yangi shartnoma ochish (StartDate: 3 oy oldin)
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        startDate.setDate(15);

        const notes = await (mongoose.model("Notes") as any).create({
            text: "Boshlang'ich izoh",
            customer: customer._id,
            createBy: new mongoose.Types.ObjectId("69401160fc16f05cb6f5241f")
        });

        const contract = await Contract.create({
            customer: customer._id,
            productName: "TEST TELEFON",
            totalPrice: 1200,
            price: 1000,
            originalPrice: 900,
            initialPayment: 0,
            monthlyPayment: 100,
            period: 12,
            startDate: startDate,
            nextPaymentDate: new Date(startDate.getFullYear(), startDate.getMonth() + 1, 15),
            status: ContractStatus.ACTIVE,
            isActive: true,
            notes: notes._id
        });
        console.log("📦 Shartnoma ochildi. Sanasi:", startDate.toISOString().split('T')[0]);
        console.log("📅 Birinchi kutilayotgan to'lov sanasi:", contract.nextPaymentDate.toISOString().split('T')[0]);

        // 3. To'lov simulyatsiyasi (Dashboard orqali 2 oylik to'lov)
        console.log("\n💰 Dashboard orqali 200$ to'lov qilinmoqda (2 oy uchun)...");

        // Simulyatsiya uchun user obyekti
        const mockUser: any = { sub: "69401160fc16f05cb6f5241f", role: "admin" };

        await paymentService.payByContract({
            contractId: (contract._id as any).toString(),
            amount: 200,
            notes: "Qo'lda to'lov testi",
            currencyDetails: { dollar: 200, sum: 0 },
            currencyCourse: 12800
        }, mockUser);

        // 4. Natijani tekshirish
        const updatedContract = await Contract.findById(contract._id);
        console.log("\n📊 Natija:");
        console.log("   Hozirgi NextPaymentDate:", updatedContract?.nextPaymentDate?.toISOString().split('T')[0]);

        // Kutilgan natija: 
        // Start: 09-15
        // 1-oy to'lovi: 10-15 (To'landi)
        // 2-oy to'lovi: 11-15 (To'landi)
        // Keyingi to'lov: 12-15 bo'lishi kerak

        const expectedDate = new Date(startDate);
        expectedDate.setMonth(startDate.getMonth() + 3); // 1-oy (10), 2-oy (11), 3-oy (12)
        expectedDate.setDate(15);

        console.log("   Kutilgan NextPaymentDate:", expectedDate.toISOString().split('T')[0]);

        if (updatedContract?.nextPaymentDate?.toISOString().split('T')[0] === expectedDate.toISOString().split('T')[0]) {
            console.log("\n✅ G'ALABA! Qo'lda to'lov qilish mantiqi 100% to'g'ri ishlamoqda.");
        } else {
            console.log("\n❌ Xatolik: Sanalar mos kelmadi.");
        }

    } catch (error) {
        console.error("❌ Xatolik:", error);
    } finally {
        await mongoose.disconnect();
    }
}

testManualWorkFlow();
