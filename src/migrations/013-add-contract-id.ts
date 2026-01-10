import Contract from "../schemas/contract.schema";
import logger from "../utils/logger";

export async function up() {
  logger.info("Migration 013: Adding contractId to existing contracts...");

  const contracts = await Contract.find({ contractId: { $exists: false } }).sort({ createdAt: 1 });

  let counter = 1;
  const lastContract = await Contract.findOne({ contractId: { $exists: true } })
    .sort({ contractId: -1 })
    .select("contractId");

  if (lastContract?.contractId) {
    counter = parseInt(lastContract.contractId.slice(1)) + 1;
  }

  for (const contract of contracts) {
    const contractId = `S${counter.toString().padStart(4, "0")}`;
    await Contract.updateOne({ _id: contract._id }, { $set: { contractId } });
    counter++;
  }

  logger.info(`Migration 013: Added contractId to ${contracts.length} contracts`);
}

export async function down() {
  logger.info("Migration 013: Removing contractId from contracts...");
  await Contract.updateMany({}, { $unset: { contractId: "" } });
  logger.info("Migration 013: Removed contractId from all contracts");
}
