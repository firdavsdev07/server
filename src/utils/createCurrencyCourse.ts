import Currency from "../schemas/currency.schema";
import logger from "../utils/logger";

const createCurrency = async () => {
  try {
    const existingCurrency = await Currency.findOne({
      name: "USD",
    });

    if (existingCurrency) {
      logger.debug("Currency already exists");
    } else {
      const currency = new Currency({
        name: "USD",
        anoumt: 0,
      });

      await currency.save();
      logger.debug("Currency created successfully");
    }
  } catch (error) {
    logger.error("Error creating Currency :", error);
  }
};

export default createCurrency;
