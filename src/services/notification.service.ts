import bot from "../bot/main";
import { IPayment } from "../schemas/payment.schema";
import { IEmployee } from "../schemas/employee.schema";
import { ICustomer } from "../schemas/customer.schema";
import { IContract } from "../schemas/contract.schema";
import Contract from "../schemas/contract.schema";
import Customer from "../schemas/customer.schema";
import Employee from "../schemas/employee.schema";
import Notification from "../schemas/notification.schema";
import logger from "../utils/logger";

/**
 * Notification Service
 * Telegram orqali xabarlar yuborish
 * Requirements: B1, B2, B3, B4, B5, B6
 */
class NotificationService {
  /**
   * To'lov tasdiqlanganda xabar yuborish
   * Requirements: B2
   */
  async sendPaymentConfirmed(
    payment: IPayment,
    customer: ICustomer,
    contract: IContract,
    manager: IEmployee
  ) {
    try {
      if (!manager.telegramId) {
        logger.debug("⚠️ Manager has no Telegram ID, skipping notification");
        return;
      }

      const actualAmount = payment.actualAmount || payment.amount;
      const expectedAmount = payment.expectedAmount || payment.amount;
      const difference = actualAmount - expectedAmount;

      let statusText = "✅ To'liq to'langan";
      let statusIcon = "✅";

      if (difference < -0.01) {
        // UNDERPAID
        const shortage = Math.abs(difference);
        statusText = `⚠️ Kam to'landi\n💰 To'langan: $${actualAmount.toFixed(2)}\n📉 Kam: $${shortage.toFixed(2)}`;
        statusIcon = "⚠️";
      } else if (difference > 0.01) {
        // OVERPAID
        const excess = difference;
        statusText = `💰 Ko'p to'landi\n💵 To'langan: $${actualAmount.toFixed(2)}\n📈 Ortiqcha: $${excess.toFixed(2)}`;
        statusIcon = "💰";
      }

      const message = `
${statusIcon} <b>TO'LOV TASDIQLANDI</b>

👤 <b>Mijoz:</b> ${customer.firstName} ${customer.lastName || ""}
📦 <b>Mahsulot:</b> ${contract.productName}
💵 <b>Summa:</b> $${actualAmount.toFixed(2)}
📊 <b>Holat:</b> ${statusText}

✅ Kassa tomonidan tasdiqlandi
      `.trim();

      await bot.telegram.sendMessage(manager.telegramId, message, {
        parse_mode: "HTML",
      });

      logger.debug("✅ Payment confirmed notification sent to manager:", manager.telegramId);
    } catch (error) {
      logger.error("❌ Error sending payment confirmed notification:", error);
    }
  }

  /**
   * To'lov rad etilganda xabar yuborish
   * Requirements: B3
   */
  async sendPaymentRejected(
    payment: IPayment,
    customer: ICustomer,
    reason: string,
    manager: IEmployee
  ) {
    try {
      if (!manager.telegramId) {
        logger.debug("⚠️ Manager has no Telegram ID, skipping notification");
        return;
      }

      const actualAmount = payment.actualAmount || payment.amount;

      const message = `
❌ <b>TO'LOV RAD ETILDI</b>

👤 <b>Mijoz:</b> ${customer.firstName} ${customer.lastName || ""}
💵 <b>Summa:</b> $${actualAmount.toFixed(2)}
📝 <b>Sabab:</b> ${reason}

ℹ️ Iltimos, qaytadan to'lov qiling
      `.trim();

      await bot.telegram.sendMessage(manager.telegramId, message, {
        parse_mode: "HTML",
      });

      logger.debug("✅ Payment rejected notification sent to manager:", manager.telegramId);
    } catch (error) {
      logger.error("❌ Error sending payment rejected notification:", error);
    }
  }

  /**
   * Avtomatik rad etilganda xabar yuborish
   * Requirements: B4
   */
  async sendPaymentAutoRejected(
    payment: IPayment,
    customer: ICustomer,
    manager: IEmployee
  ) {
    try {
      if (!manager.telegramId) {
        logger.debug("⚠️ Manager has no Telegram ID, skipping notification");
        return;
      }

      const actualAmount = payment.actualAmount || payment.amount;
      const createdDate = payment.createdAt
        ? new Date(payment.createdAt).toLocaleString("uz-UZ")
        : "Noma'lum";

      const message = `
⏰ <b>TO'LOV MUDDATI O'TDI</b>

👤 <b>Mijoz:</b> ${customer.firstName} ${customer.lastName || ""}
💵 <b>Summa:</b> $${actualAmount.toFixed(2)}
📅 <b>Yuborilgan:</b> ${createdDate}

❌ 24 soat ichida tasdiqlanmadi
ℹ️ Iltimos, qaytadan to'lov qiling
      `.trim();

      await bot.telegram.sendMessage(manager.telegramId, message, {
        parse_mode: "HTML",
      });

      logger.debug("✅ Payment auto-rejected notification sent to manager:", manager.telegramId);
    } catch (error) {
      logger.error("❌ Error sending auto-rejected notification:", error);
    }
  }

  /**
   * Ko'p to'langan xabarnoma (ortiqcha to'lov taqsimoti bilan)
   * Requirements: B6
   */
  async sendOverpaymentNotification(
    payment: IPayment,
    customer: ICustomer,
    contract: IContract,
    manager: IEmployee,
    createdPayments: any[],
    prepaidBalance: number
  ) {
    try {
      if (!manager.telegramId) {
        logger.debug("⚠️ Manager has no Telegram ID, skipping notification");
        return;
      }

      const actualAmount = payment.actualAmount || payment.amount;
      const expectedAmount = payment.expectedAmount || payment.amount;
      const excess = actualAmount - expectedAmount;

      let distributionText = "";
      if (createdPayments.length > 0) {
        distributionText = "\n\n📊 <b>Taqsimot:</b>\n";
        createdPayments.forEach((p) => {
          const status =
            p.status === "PAID"
              ? "✅ to'liq"
              : `⚠️ kam, $${(p.remainingAmount || 0).toFixed(2)} qoldi`;
          distributionText += `• ${p.targetMonth || "?"}-oy: $${(p.actualAmount || 0).toFixed(2)} (${status})\n`;
        });
      }

      let prepaidText = "";
      if (prepaidBalance > 0.01) {
        prepaidText = `\n💎 <b>Prepaid balance:</b> $${prepaidBalance.toFixed(2)}`;
      }

      const message = `
💰 <b>KO'P TO'LOV TASDIQLANDI</b>

👤 <b>Mijoz:</b> ${customer.firstName} ${customer.lastName || ""}
📦 <b>Mahsulot:</b> ${contract.productName}
💵 <b>To'langan:</b> $${actualAmount.toFixed(2)}
📈 <b>Ortiqcha:</b> $${excess.toFixed(2)}
${distributionText}${prepaidText}

✅ Kassa tomonidan tasdiqlandi
      `.trim();

      await bot.telegram.sendMessage(manager.telegramId, message, {
        parse_mode: "HTML",
      });

      logger.debug("✅ Overpayment notification sent to manager:", manager.telegramId);
    } catch (error) {
      logger.error("❌ Error sending overpayment notification:", error);
    }
  }

  /**
   * Kam to'langan xabarnoma
   * Requirements: B5
   */
  async sendUnderpaymentNotification(
    payment: IPayment,
    customer: ICustomer,
    contract: IContract,
    manager: IEmployee
  ) {
    try {
      if (!manager.telegramId) {
        logger.debug("⚠️ Manager has no Telegram ID, skipping notification");
        return;
      }

      const actualAmount = payment.actualAmount || payment.amount;
      const expectedAmount = payment.expectedAmount || payment.amount;
      const shortage = expectedAmount - actualAmount;

      const message = `
⚠️ <b>TO'LOV KAM TASDIQLANDI</b>

👤 <b>Mijoz:</b> ${customer.firstName} ${customer.lastName || ""}
📦 <b>Mahsulot:</b> ${contract.productName}
💵 <b>To'langan:</b> $${actualAmount.toFixed(2)}
💰 <b>Kutilgan:</b> $${expectedAmount.toFixed(2)}
📉 <b>Kam to'langan:</b> $${shortage.toFixed(2)}

ℹ️ Qolgan $${shortage.toFixed(2)} ni to'lash kerak
✅ Kassa tomonidan tasdiqlandi
      `.trim();

      await bot.telegram.sendMessage(manager.telegramId, message, {
        parse_mode: "HTML",
      });

      logger.debug("✅ Underpayment notification sent to manager:", manager.telegramId);
    } catch (error) {
      logger.error("❌ Error sending underpayment notification:", error);
    }
  }

  /**
   * ✅ YANGI: Kechiktirilgan to'lovlar uchun reminder yuborish
   * Har 15 daqiqada tekshirish va reminder yuborish
   */
  async sendPostponeReminders() {
    try {
      logger.info("🔍 === CHECKING POSTPONED PAYMENTS FOR REMINDERS ===");
      
      const now = new Date();
      logger.info(`🕐 Current time: ${now.toISOString()}`);
      
      // Debug: Barcha postponed contractlarni topish (sana shartisiz)
      const allPostponedContracts = await Contract.find({
        isPostponedOnce: true,
        status: "active",
      });
      
      logger.info(`📊 Total postponed contracts found: ${allPostponedContracts.length}`);
      
      allPostponedContracts.forEach((contract, index) => {
        logger.info(`${index + 1}. Contract ID: ${contract._id}, reminderDate: ${contract.reminderDate?.toISOString()}, nextPaymentDate: ${contract.nextPaymentDate?.toISOString()}, productName: ${contract.productName}`);
      });
      
      // Kechiktirilgan to'lovlar sanasi yetgan shartnomalarni topish
      const contractsToRemind = await Contract.find({
        isPostponedOnce: true,
        reminderDate: { $lte: now }, // ✅ TUZATISH: reminderDate ishlatish
        status: "active",
      }).populate([
        { 
          path: "customer", 
          select: "firstName lastName phoneNumber manager"
        }
      ]);
      
      // Populate manager separately
      await Contract.populate(contractsToRemind, {
        path: "customer.manager",
        select: "telegramId firstName lastName"
      });

      logger.debug(`✅ Found ${contractsToRemind.length} contracts with due postponed payments`);

      for (const contract of contractsToRemind) {
        const customer = contract.customer as any;
        const manager = customer?.manager as any;

        if (!manager || !manager.telegramId) {
          logger.debug(`⚠️ Manager not found or no Telegram ID for contract ${contract._id}`);
          continue;
        }

        // Oxirgi notification yuborilganidan beri 1 soat o'tganini tekshirish
        const lastNotification = await Notification.findOne({
          managerId: manager._id,
          type: "PAYMENT_POSTPONE_REMINDER",
          "data.contractId": contract._id,
          createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } // 1 soat oldin
        });

        if (lastNotification) {
          logger.debug(`⏭️ Already sent reminder in last hour for contract ${contract._id}`);
          continue;
        }

        const message = `
🔔 <b>TO'LOV ESLATMASI!</b>

👤 <b>Mijoz:</b> ${customer.firstName} ${customer.lastName || ""}
📱 <b>Telefon:</b> ${customer.phoneNumber}
📦 <b>Mahsulot:</b> ${contract.productName}
💰 <b>Oylik to'lov:</b> $${contract.monthlyPayment.toFixed(2)}
📅 <b>Eslatma sanasi:</b> ${contract.reminderDate?.toLocaleDateString("uz-UZ")}

⏰ <b>Belgilangan eslatma vaqti yetdi!</b>
📞 Mijoz bilan bog'laning va to'lovni oling.

#Eslatma #TolovEslatmasi
        `.trim();

        await bot.telegram.sendMessage(manager.telegramId, message, {
          parse_mode: "HTML",
        });

        // Notification record yaratish
        await Notification.create({
          managerId: manager._id,
          type: "PAYMENT_POSTPONE_REMINDER",
          title: "Kechiktirilgan to'lov vaqti yetdi",
          message: `${customer.firstName} ${customer.lastName || ""} - ${contract.productName}`,
          data: {
            paymentId: null, // Hali payment yaratilmagan
            customerId: customer._id,
            customerName: `${customer.firstName} ${customer.lastName || ""}`,
            contractId: contract._id,
            productName: contract.productName,
            amount: contract.monthlyPayment,
            status: "POSTPONED_DUE",
          },
          isRead: false,
        });

        logger.debug(`✅ Postpone reminder sent to manager ${manager.firstName} for contract ${contract._id}`);
      }

      logger.debug("🎉 === POSTPONED PAYMENT REMINDERS CHECK COMPLETED ===");
    } catch (error) {
      logger.error("❌ Error sending postpone reminders:", error);
    }
  }
}

export default new NotificationService();
