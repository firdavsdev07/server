import Customer from "../schemas/customer.schema";
import logger from "../utils/logger";

export async function up() {
  logger.info("Migration 012: Adding customerId to existing customers...");

  const customers = await Customer.find({ customerId: { $exists: false } }).sort({ createdAt: 1 });

  let counter = 1;
  // Avval mavjud eng katta customerId ni topamiz
  const lastCustomer = await Customer.findOne({ customerId: { $exists: true } })
    .sort({ customerId: -1 })
    .select("customerId");

  if (lastCustomer?.customerId) {
    counter = parseInt(lastCustomer.customerId.slice(1)) + 1;
  }

  for (const customer of customers) {
    const customerId = `M${counter.toString().padStart(4, "0")}`;
    await Customer.updateOne({ _id: customer._id }, { $set: { customerId } });
    counter++;
  }

  logger.info(`Migration 012: Added customerId to ${customers.length} customers`);
}

export async function down() {
  logger.info("Migration 012: Removing customerId from customers...");
  await Customer.updateMany({}, { $unset: { customerId: "" } });
  logger.info("Migration 012: Removed customerId from all customers");
}
