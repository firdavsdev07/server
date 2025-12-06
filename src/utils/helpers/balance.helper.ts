import { Balance } from "../../schemas/balance.schema";
import { IEmployee } from "../../schemas/employee.schema";
import logger from "../../utils/logger";

/**
 * Balance Helper
 * Balance bilan ishlash uchun yordamchi funksiyalar
 */
export class BalanceHelper {
  /**
   * Balance yangilash
   * @param managerId - Manager ID
   * @param changes - O'zgarishlar (dollar, sum)
   */
  static async updateBalance(
    managerId: IEmployee | string,
    changes: {
      dollar?: number;
      sum?: number;
    }
  ) {
    try {
      let balance = await Balance.findOne({ managerId });

      if (!balance) {
        balance = await Balance.create({
          managerId,
          dollar: changes.dollar || 0,
          sum: changes.sum || 0,
        });
        logger.debug("✅ New balance created:", balance._id);
      } else {
        balance.dollar += changes.dollar || 0;
        if (balance.sum !== undefined && changes.sum !== undefined) {
          balance.sum += changes.sum;
        }
        await balance.save();
        logger.debug("✅ Balance updated:", balance._id);
      }

      return balance;
    } catch (error) {
      logger.error("❌ Error updating balance:", error);
      throw error;
    }
  }

  /**
   * Balance olish
   * @param managerId - Manager ID
   */
  static async getBalance(managerId: IEmployee | string) {
    try {
      const balance = await Balance.findOne({ managerId });
      return balance || { dollar: 0, sum: 0, managerId };
    } catch (error) {
      logger.error("❌ Error getting balance:", error);
      throw error;
    }
  }
}
