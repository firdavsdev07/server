/**
 * Balance Helper - Handles balance operations
 */

import { Balance } from "../../../schemas/balance.schema";
import { Types } from "mongoose";
import { BalanceUpdate } from "./contract.types";
import logger from "../../../utils/logger";

export class ContractBalanceHelper {
  /**
   * Update manager balance
   * @param managerId - Manager ID
   * @param changes - Dollar and Sum changes
   */
  async updateBalance(
    managerId: Types.ObjectId | string,
    changes: BalanceUpdate
  ): Promise<any> {
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
        balance.sum += changes.sum || 0;
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
   * Revert balance changes (for rollback)
   * @param managerId - Manager ID
   * @param changes - Dollar and Sum changes to revert
   */
  async revertBalance(
    managerId: Types.ObjectId | string,
    changes: BalanceUpdate
  ): Promise<void> {
    try {
      const balance = await Balance.findOne({ managerId });
      if (!balance) {
        logger.warn("⚠️ Balance not found for revert");
        return;
      }

      balance.dollar -= changes.dollar || 0;
      balance.sum -= changes.sum || 0;
      await balance.save();

      logger.debug("✅ Balance reverted:", balance._id);
    } catch (error) {
      logger.error("❌ Error reverting balance:", error);
      throw error;
    }
  }
}

export default new ContractBalanceHelper();
