import Contract from "../schemas/contract.schema";
import logger from "./logger";

/**
 * Mavjud shartnomalar uchun contractId qo'shish
 * Server ishga tushganda avtomatik ishlaydi
 */
export async function ensureContractIds(): Promise<void> {
  try {
    const contracts = await Contract.find({ 
      $or: [
        { contractId: { $exists: false } },
        { contractId: null }
      ]
    }).sort({ createdAt: 1 });

    if (contracts.length === 0) {
      return;
    }

    logger.info(`📝 Adding contractId to ${contracts.length} contracts...`);

    for (const contract of contracts) {
      await contract.save(); // pre-save hook avtomatik contractId qo'shadi
    }

    logger.info(`✅ Added contractId to ${contracts.length} contracts`);
  } catch (error) {
    logger.error("❌ Error ensuring contract IDs:", error);
  }
}
