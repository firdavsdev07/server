import Reminder from "../../schemas/reminder.schema";
import Contract from "../../schemas/contract.schema";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

class ReminderService {
  /**
   * Oy uchun reminder mavjudligini tekshirish
   */
  async checkMonthReminder(contractId: string, targetMonth: number, user: IJwtUser) {
    logger.debug(`📅 Checking reminder for contract ${contractId}, month ${targetMonth}`);

    // Shartnoma mavjudligini tekshirish
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw BaseError.NotFoundError("Shartnoma topilmadi");
    }

    // O'sha oy uchun reminder topish
    const reminder = await Reminder.findOne({
      contractId: contractId,
      targetMonth: targetMonth,
      isActive: true,
    });

    logger.debug(`📊 Reminder check result:`, {
      contractId,
      targetMonth,
      found: !!reminder,
      reminderDate: reminder?.reminderDate,
    });

    return {
      status: "success",
      exists: !!reminder,
      reminderDate: reminder?.reminderDate || null,
      reminder: reminder ? {
        _id: reminder._id,
        targetMonth: reminder.targetMonth,
        reminderDate: reminder.reminderDate,
        reason: reminder.reason,
        isActive: reminder.isActive,
      } : null,
    };
  }
}

export default new ReminderService();