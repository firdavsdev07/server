import Counter from "../schemas/counter.schema";

/**
 * Mijoz ID generatsiya qilish
 * Format: 1001, 1002, 1003...
 * 1000 dan boshlanadi
 */
export async function generateCustomerId(): Promise<number> {
    const counter = await Counter.findOneAndUpdate(
        { name: "customer" },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // 1000 dan boshlash uchun
    return 1000 + counter.value;
}

/**
 * To'lov ID generatsiya qilish
 * Format: P-0001, P-0002, P-0003...
 */
export async function generatePaymentId(): Promise<string> {
    const counter = await Counter.findOneAndUpdate(
        { name: "payment" },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // P-0001 formatida
    return `P-${String(counter.value).padStart(4, "0")}`;
}
