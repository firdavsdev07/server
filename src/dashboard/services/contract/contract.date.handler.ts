/**
 * Contract Date Edit Handler
 * Shartnoma sanasini o'zgartirish va bog'liq entitylarni yangilash
 * 
 * ONLY ADMIN & MODERATOR
 */

import BaseError from "../../../utils/base.error";
import Contract, { ContractStatus, IContractEdit } from "../../../schemas/contract.schema";
import Payment, { PaymentStatus, PaymentType } from "../../../schemas/payment.schema";
import { Debtor } from "../../../schemas/debtor.schema";
import logger from "../../../utils/logger";
import auditLogService from "../../../services/audit-log.service";
import IJwtUser from "../../../types/user";
import Employee from "../../../schemas/employee.schema";
import dayjs from "dayjs";

interface UpdateContractDateDto {
  contractId: string;
  newStartDate: Date;
  reason?: string;
}

class ContractDateHandler {
  /**
   * Shartnoma sanasini o'zgartirish
   * Requirements:
   * 1. Faqat admin va moderator ruxsat etilgan
   * 2. Barcha to'lovlarning sanalarini qayta hisoblash
   * 3. Qarzdorlarning sanalarini yangilash
   * 4. Audit log ga yozish
   * 5. Contract editHistory ga qo'shish
   */
  async updateContractStartDate(
    data: UpdateContractDateDto,
    user: IJwtUser
  ): Promise<{
    message: string;
    contractId: string;
    changes: {
      oldStartDate: Date;
      newStartDate: Date;
      affectedPayments: number;
      affectedDebtors: number;
    };
  }> {
    try {
      logger.info("📅 === CONTRACT DATE UPDATE STARTED ===");
      logger.info(`Contract ID: ${data.contractId}`);
      logger.info(`New Start Date: ${data.newStartDate}`);
      logger.info(`Updated by: ${user.sub}`);

      const { contractId, newStartDate, reason } = data;

      // 1. Validate employee role (only admin & moderator)
      const employee = await Employee.findById(user.sub).populate("role");
      if (!employee) {
        throw BaseError.ForbiddenError("Xodim topilmadi");
      }

      const roleName = (employee.role as any)?.name;
      const isAuthorized = roleName === "admin" || roleName === "moderator";

      if (!isAuthorized) {
        throw BaseError.ForbiddenError(
          "Faqat Admin va Moderator shartnoma sanasini o'zgartira oladi"
        );
      }

      logger.info(`👤 User role: ${roleName} - Authorized: ${isAuthorized}`);

      // 2. Find contract with all relations
      const contract = await Contract.findById(contractId)
        .populate("customer")
        .populate({
          path: "payments",
          options: { strictPopulate: false }  // ✅ Barcha to'lovlarni olish
        });

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      if (contract.isDeleted) {
        throw BaseError.BadRequest("O'chirilgan shartnomani tahrirlash mumkin emas");
      }

      logger.info(`📋 Contract found: ${contract._id}`);
      logger.info(`Old start date: ${contract.startDate}`);
      logger.info(`📊 Contract.payments length: ${(contract.payments as any[])?.length || 0}`);

      // 3. Validate new date
      const oldStartDate = new Date(contract.startDate);
      const newStartDateObj = new Date(newStartDate);

      if (newStartDateObj >= new Date()) {
        throw BaseError.BadRequest(
          "Yangi sana bugundan oldingi sana bo'lishi kerak"
        );
      }

      // 4. Calculate date difference
      const daysDifference = dayjs(newStartDateObj).diff(
        dayjs(oldStartDate),
        "day"
      );
      const monthsDifference = dayjs(newStartDateObj).diff(
        dayjs(oldStartDate),
        "month"
      );

      logger.info(`📊 Date difference: ${daysDifference} days, ${monthsDifference} months`);

      // 5. Update all payment dates
      // ⚠️ MUHIM: contract.payments populate qilinganda ba'zi to'lovlar tushib qolishi mumkin
      // Shuning uchun to'lovlarni to'g'ridan-to'g'ri Payment collection'dan topamiz
      const payments = contract.payments as any[];
      
      // ✅ paymentIds ni extract qilish (ObjectId yoki string)
      const paymentIds = payments
        .map((p) => {
          if (!p) return null;
          // Agar to'lov object bo'lsa, _id ni olish
          if (typeof p === 'object' && p._id) return p._id.toString();
          // Agar string yoki ObjectId bo'lsa, to'g'ridan-to'g'ri ishlatish
          return p.toString();
        })
        .filter(Boolean);
      
      logger.info(`📊 Extracted ${paymentIds.length} payment ID(s) from contract.payments`);
      
      // ✅ Barcha to'lovlarni to'g'ridan-to'g'ri Payment collection'dan olish
      const allContractPayments = await Payment.find({
        _id: { $in: paymentIds }
      });
      
      logger.info(`📊 Found ${allContractPayments.length} payment(s) in Payment collection`);
      
      // ⚠️ DEBUGGING: Agar soni mos kelmasa, xabar berish
      if (paymentIds.length !== allContractPayments.length) {
        logger.warn(`⚠️ WARNING: Expected ${paymentIds.length} payments but found ${allContractPayments.length}!`);
        logger.warn(`⚠️ Payment IDs: ${JSON.stringify(paymentIds)}`);
        logger.warn(`⚠️ Found IDs: ${JSON.stringify(allContractPayments.map(p => p._id.toString()))}`);
      }
      
      let affectedPaymentsCount = 0;

      for (const paymentDoc of allContractPayments) {
        if (!paymentDoc) continue;

        // ⚠️ MUHIM: To'langan to'lovlarning sanasini o'zgartirmaymiz!
        // Faqat to'lanmagan to'lovlarni yangilaymiz
        if (paymentDoc.isPaid) {
          logger.debug(`⏭️ Skipping paid payment ${paymentDoc._id} - historical data preserved`);
          continue;
        }

        // Asl to'lov sanasi
        const oldPaymentDate = new Date(paymentDoc.date);
        
        // Yangi to'lov sanasini hisoblash
        // Agar to'lov initial bo'lsa, newStartDate ni ishlatamiz
        if (paymentDoc.paymentType === PaymentType.INITIAL) {
          paymentDoc.date = newStartDateObj;
          affectedPaymentsCount++;
        } 
        // Agar oylik to'lov bo'lsa, targetMonth ga qarab hisoblash
        else if (paymentDoc.paymentType === PaymentType.MONTHLY) {
          const targetMonth = paymentDoc.targetMonth || 1;
          const newDay = newStartDateObj.getDate();
          
          // Yangi sanani yaratish (birinchi kun bilan)
          const newPaymentDate = new Date(
            newStartDateObj.getFullYear(),
            newStartDateObj.getMonth() + targetMonth,
            1  // Birinchi kun
          );
          
          // Oxirgi kunni topish
          const lastDayOfMonth = new Date(
            newPaymentDate.getFullYear(),
            newPaymentDate.getMonth() + 1,
            0
          ).getDate();
          
          // To'g'ri kunni o'rnatish (oyning oxirgi kunidan oshmasligi kerak)
          newPaymentDate.setDate(Math.min(newDay, lastDayOfMonth));
          
          paymentDoc.date = newPaymentDate;
          affectedPaymentsCount++;
        }

        await paymentDoc.save();
        
        logger.debug(`✅ Payment ${paymentDoc._id} updated: ${oldPaymentDate} -> ${paymentDoc.date}`);
      }

      logger.info(`📊 Updated ${affectedPaymentsCount} payments`);

      // 6. Update contract dates
      const oldNextPaymentDate = contract.nextPaymentDate;
      const oldPreviousPaymentDate = contract.previousPaymentDate;

      contract.startDate = newStartDateObj;
      contract.initialPaymentDueDate = newStartDateObj;
      
      // ✅ originalPaymentDay ni yangilash
      contract.originalPaymentDay = newStartDateObj.getDate();
      logger.info(`✅ originalPaymentDay updated to: ${contract.originalPaymentDay}`);
      
      // nextPaymentDate ni qayta hisoblash
      const unpaidMonthlyPayments = allContractPayments
        .filter(p => !p.isPaid && p.paymentType === PaymentType.MONTHLY)
        .sort((a, b) => (a.targetMonth || 0) - (b.targetMonth || 0));

      if (unpaidMonthlyPayments.length > 0) {
        contract.nextPaymentDate = unpaidMonthlyPayments[0].date;
      } else {
        // Hamma to'langan bo'lsa, oxirgi oyga +1 oy qo'shamiz
        const lastPaymentDate = new Date(newStartDateObj);
        lastPaymentDate.setMonth(newStartDateObj.getMonth() + contract.period);
        contract.nextPaymentDate = lastPaymentDate;
      }

      // 7. ❌ ESKI DEBTOR'LARNI O'CHIRISH
      const oldDebtors = await Debtor.find({ contractId: contract._id });
      const deletedDebtors = await Debtor.deleteMany({ contractId: contract._id });
      logger.info(`🗑️ Deleted ${deletedDebtors.deletedCount} old debtor(s) for contract ${contract._id}`);
      
      // 8. ✅ YANGI DEBTOR'LARNI YARATISH (BARCHA to'lanmagan to'lovlar uchun)
      // ⚠️ MUHIM: Initial va Monthly to'lovlarni ham tekshirish kerak!
      // ⚠️ MUHIM 2: To'lovlarni to'g'ridan-to'g'ri allContractPayments dan olish
      const allUnpaidPayments = allContractPayments.filter(p => !p.isPaid).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      logger.info(`🔍 DEBUG: allUnpaidPayments.length = ${allUnpaidPayments.length}`);
      logger.info(`🔍 DEBUG: today = ${today.toISOString()}`);
      
      let newDebtorsCreated = 0;
      
      for (const payment of allUnpaidPayments) {
        logger.info(`🔍 DEBUG: Checking payment: ${payment._id}, type: ${payment.paymentType}, date: ${payment.date}, isPaid: ${payment.isPaid}`);
        const paymentDate = new Date(payment.date);
        paymentDate.setHours(0, 0, 0, 0); // ✅ Timezone fix - faqat sanani solishtirish
        
        // Faqat kechikkan to'lovlar uchun debtor yaratish
        if (paymentDate < today) {
          const overdueDays = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          await Debtor.create({
            contractId: contract._id,
            debtAmount: payment.amount,
            dueDate: payment.date, // ✅ Original date'ni saqlash (timezone bilan)
            overdueDays: Math.max(0, overdueDays),
            createBy: contract.createBy,
          });
          
          newDebtorsCreated++;
          logger.debug(`✅ New debtor created: Type ${payment.paymentType}, Due ${paymentDate.toISOString().split('T')[0]}, Overdue ${overdueDays} days`);
        }
      }
      
      logger.info(`📊 Deleted ${deletedDebtors.deletedCount} old debtors, Created ${newDebtorsCreated} new debtors`);
      
      const affectedDebtorsCount = oldDebtors.length;

      // 8. Add to editHistory
      const editEntry: IContractEdit = {
        date: new Date(),
        editedBy: employee._id as any,
        changes: [
          {
            field: "startDate",
            oldValue: oldStartDate,
            newValue: newStartDateObj,
            difference: daysDifference,
          },
          {
            field: "nextPaymentDate",
            oldValue: oldNextPaymentDate,
            newValue: contract.nextPaymentDate,
            difference: 0,
          },
        ],
        affectedPayments: paymentIds,
        impactSummary: {
          underpaidCount: 0,
          overpaidCount: 0,
          totalShortage: 0,
          totalExcess: 0,
          additionalPaymentsCreated: 0,
        },
      };

      if (!contract.editHistory) {
        contract.editHistory = [];
      }
      contract.editHistory.push(editEntry);

      // 🔥 MUHIM: isDeclare ni save qilishdan OLDIN false qilish
      // Chunki agar yangi debtor yaratilgan bo'lsa, shartnoma qarzdorlar ro'yxatida ko'rinishi kerak
      if (newDebtorsCreated > 0) {
        contract.isDeclare = false;
        logger.info(`✅ isDeclare reset to false (${newDebtorsCreated} new debtor(s) created)`);
      }

      await contract.save();

      logger.info("✅ Contract saved with updated dates and editHistory");

      // 9. Audit log
      const customerData = contract.customer as any;
      await auditLogService.createLog({
        action: "UPDATE" as any,
        entity: "contract" as any,
        entityId: contract._id.toString(),
        userId: user.sub,
        changes: [
          {
            field: "startDate",
            oldValue: oldStartDate.toISOString(),
            newValue: newStartDateObj.toISOString(),
          },
          {
            field: "nextPaymentDate",
            oldValue: oldNextPaymentDate?.toISOString() || "N/A",
            newValue: contract.nextPaymentDate.toISOString(),
          },
        ],
        metadata: {
          customerName: customerData.fullName,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          employeeRole: roleName,
          affectedEntities: [
            {
              entityType: "contract",
              entityId: contract._id.toString(),
              entityName: `${customerData.fullName} - ${contract.productName}`,
            },
            ...paymentIds.map((pid: any) => ({
              entityType: "payment",
              entityId: pid.toString(),
              entityName: "Payment date updated",
            })),
            ...oldDebtors.map((d) => ({
              entityType: "debtor",
              entityId: d._id.toString(),
              entityName: "Debtor deleted and recreated",
            })),
          ],
        },
      });

      logger.info("✅ Audit log created");
      logger.info("🎉 === CONTRACT DATE UPDATE COMPLETED ===");

      return {
        message: "Shartnoma sanasi muvaffaqiyatli o'zgartirildi",
        contractId: contract._id.toString(),
        changes: {
          oldStartDate,
          newStartDate: newStartDateObj,
          affectedPayments: affectedPaymentsCount,
          affectedDebtors: affectedDebtorsCount,
        },
      };
    } catch (error) {
      logger.error("❌ === CONTRACT DATE UPDATE FAILED ===");
      logger.error("Error:", error);
      throw error;
    }
  }

  /**
   * Shartnoma sanasini o'zgartirish ta'sirini oldindan ko'rish
   */
  async previewDateChange(
    contractId: string,
    newStartDate: Date
  ): Promise<{
    oldStartDate: Date;
    newStartDate: Date;
    dateDifference: {
      days: number;
      months: number;
    };
    affectedPayments: Array<{
      paymentId: string;
      type: string;
      targetMonth?: number;
      oldDate: Date;
      newDate: Date;
      isPaid: boolean;
      willChange: boolean;  // ✅ To'lov o'zgaradimi yoki yo'qmi
    }>;
    affectedDebtors: Array<{
      debtorId: string;
      oldDueDate: Date;
      newDueDate: Date;
      debtAmount: number;
    }>;
  }> {
    try {
      const contract = await Contract.findById(contractId).populate("payments");
      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const oldStartDate = new Date(contract.startDate);
      const newStartDateObj = new Date(newStartDate);

      const daysDifference = dayjs(newStartDateObj).diff(dayjs(oldStartDate), "day");
      const monthsDifference = dayjs(newStartDateObj).diff(dayjs(oldStartDate), "month");

      // Preview payments
      // ✅ To'g'ridan-to'g'ri Payment collection'dan barcha to'lovlarni olish
      const allPayments = await Payment.find({
        _id: { $in: contract.payments }
      }).sort({ targetMonth: 1 });
      
      logger.info(`📊 Total payments found: ${allPayments.length}`);
      
      const affectedPayments = [];

      for (const paymentDoc of allPayments) {
        if (!paymentDoc) continue;

        const oldPaymentDate = new Date(paymentDoc.date);
        let newPaymentDate: Date;

        // ⚠️ To'langan to'lovlar o'zgartirilmaydi
        if (paymentDoc.isPaid) {
          newPaymentDate = oldPaymentDate; // Saqlanadi
        } else if (paymentDoc.paymentType === PaymentType.INITIAL) {
          newPaymentDate = newStartDateObj;
        } else if (paymentDoc.paymentType === PaymentType.MONTHLY) {
          const targetMonth = paymentDoc.targetMonth || 1;
          const newDay = newStartDateObj.getDate();
          
          // Yangi sanani yaratish (birinchi kun bilan)
          newPaymentDate = new Date(
            newStartDateObj.getFullYear(),
            newStartDateObj.getMonth() + targetMonth,
            1  // Birinchi kun
          );
          
          // Oxirgi kunni topish
          const lastDayOfMonth = new Date(
            newPaymentDate.getFullYear(),
            newPaymentDate.getMonth() + 1,
            0
          ).getDate();
          
          // To'g'ri kunni o'rnatish (oyning oxirgi kunidan oshmasligi kerak)
          newPaymentDate.setDate(Math.min(newDay, lastDayOfMonth));
        } else {
          newPaymentDate = oldPaymentDate;
        }

        affectedPayments.push({
          paymentId: paymentDoc._id.toString(),
          type: paymentDoc.paymentType,
          targetMonth: paymentDoc.targetMonth,
          oldDate: oldPaymentDate,
          newDate: newPaymentDate,
          isPaid: paymentDoc.isPaid,
          willChange: !paymentDoc.isPaid,  // ✅ Faqat to'lanmagan to'lovlar o'zgaradi
        });
      }

      // Preview debtors
      const debtors = await Debtor.find({ contractId: contract._id });
      const affectedDebtors = debtors.map((debtor) => {
        const oldDueDate = new Date(debtor.dueDate);
        const newDueDate = new Date(oldDueDate);
        newDueDate.setTime(newDueDate.getTime() + daysDifference * 24 * 60 * 60 * 1000);

        return {
          debtorId: debtor._id.toString(),
          oldDueDate,
          newDueDate,
          debtAmount: debtor.debtAmount,
        };
      });

      return {
        oldStartDate,
        newStartDate: newStartDateObj,
        dateDifference: {
          days: daysDifference,
          months: monthsDifference,
        },
        affectedPayments,
        affectedDebtors,
      };
    } catch (error) {
      logger.error("❌ Error previewing date change:", error);
      throw error;
    }
  }
}

export default new ContractDateHandler();
