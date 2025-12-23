import logger from "../../utils/logger";
import BaseError from "../../utils/base.error";
import Payment, { PaymentStatus } from "../../schemas/payment.schema";
import paymentService from "./payment.service";
import IJwtUser from "../../types/user";
import auditLogService from "../../services/audit-log.service";

class CashService {
  /**
   * Tasdiqlanmagan to'lovlarni olish
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.1, 9.2
   */
  async getPendingPayments() {
    try {
      logger.log("🔍 === FETCHING PENDING PAYMENTS FOR CASH ===");

      // Debug: Barcha to'lovlarni sanash
      const totalPayments = await Payment.countDocuments();
      const pendingCount = await Payment.countDocuments({
        status: PaymentStatus.PENDING,
      });
      const paidCount = await Payment.countDocuments({
        status: PaymentStatus.PAID,
      });

      logger.log("📊 Payment Statistics:", {
        total: totalPayments,
        pendingForCash: pendingCount,
        totalPaid: paidCount,
      });

      // ✅ Faqat PENDING statusdagi to'lovlarni olish
      // Kassa sahifasida faqat tasdiqlanmagan to'lovlar ko'rinishi kerak
      // status: PENDING - hali tasdiqlanmagan (bot'dan kelgan)
      const payments = await Payment.find({
        status: PaymentStatus.PENDING,
      })
        .populate({
          path: "customerId",
          select: "firstName lastName phoneNumber manager",
          populate: {
            path: "manager",
            select: "firstName lastName",
          },
        })
        .populate("managerId", "firstName lastName")
        .populate("notes", "text")
        .select(
          "_id amount actualAmount date isPaid paymentType notes customerId managerId status remainingAmount excessAmount expectedAmount confirmedAt confirmedBy targetMonth nextPaymentDate createdAt updatedAt"
        )
        .sort({ date: -1 })
        .lean();

      logger.log("✅ Found pending payments for cash:", payments.length);

      // ✅ Har bir payment uchun contractId topish
      const Contract = (await import("../../schemas/contract.schema")).default;
      
      const paymentsWithContract = await Promise.all(
        payments.map(async (payment: any) => {
          try {
            // ✅ YANGI MANTIQ: Payment ID orqali yoki customer ID orqali contract topish
            // PENDING to'lovlar Contract.payments arrayida bo'lmaydi, shuning uchun customer ID dan topamiz
            let contract = await Contract.findOne({
              payments: payment._id,
            })
              .select("_id productName customer")
              .populate("customer", "firstName lastName")
              .lean();

            // Agar Contract.payments da topilmasa, customer ID orqali topish (PENDING to'lovlar uchun)
            if (!contract && payment.customerId) {
              contract = await Contract.findOne({
                customer: payment.customerId._id || payment.customerId,
                status: "active", // Faqat faol shartnomalar
              })
                .select("_id productName customer")
                .populate("customer", "firstName lastName")
                .sort({ createdAt: -1 }) // Eng yangi shartnomani olish
                .lean();

              if (contract) {
                logger.log(
                  `✅ Payment ${payment._id} -> Contract ${contract._id} (found by customer ID)`
                );
              }
            }

            if (contract) {
              logger.log(
                `✅ Payment ${payment._id} -> Contract ${contract._id} (${contract.productName})`
              );
            } else {
              logger.warn(`⚠️ Payment ${payment._id} -> Contract NOT FOUND`);
            }

            return {
              ...payment,
              contractId: contract?._id?.toString() || null,
            };
          } catch (error) {
            logger.error(
              `❌ Error finding contract for payment ${payment._id}:`,
              error
            );
            return {
              ...payment,
              contractId: null,
            };
          }
        })
      );

      if (paymentsWithContract.length > 0) {
        logger.log("📋 Sample payment:", {
          id: paymentsWithContract[0]._id,
          customer: paymentsWithContract[0].customerId,
          manager: paymentsWithContract[0].managerId,
          amount: paymentsWithContract[0].amount,
          status: paymentsWithContract[0].status,
          contractId: paymentsWithContract[0].contractId,
          date: paymentsWithContract[0].date,
        });
      }

      if (!paymentsWithContract || paymentsWithContract.length === 0) {
        logger.log("⚠️ No pending payments found for cash");
        return [];
      }

      return paymentsWithContract;
    } catch (error) {
      logger.error("❌ Error fetching payments:", error);
      logger.error("❌ Error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw BaseError.InternalServerError(
        "To'lovlarni olishda xatolik yuz berdi"
      );
    }
  }

  /**
   * To'lovlarni tasdiqlash
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.1, 4.2, 4.3, 4.4, 4.5, 9.3, 9.4
   */
  async confirmPayments(paymentIds: string[], user: IJwtUser) {
    try {
      logger.log("✅ === CONFIRMING PAYMENTS (CASH) ===");
      logger.log("📋 Payment IDs to confirm:", paymentIds);
      logger.log("👤 User:", {
        id: user.sub,
        name: user.name,
        role: user.role,
      });

      if (!paymentIds || paymentIds.length === 0) {
        logger.warn("⚠️ No payment IDs provided");
        throw BaseError.BadRequest("To'lov ID lari kiritilmagan");
      }

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      // Har bir payment uchun alohida try-catch qo'shish
      for (const paymentId of paymentIds) {
        try {
          logger.log(`🔄 Processing payment: ${paymentId}`);
          const result = await paymentService.confirmPayment(paymentId, user);

          // Success natijani qaytarish
          results.push({
            paymentId,
            status: "success",
            message: "To'lov muvaffaqiyatli tasdiqlandi",
            data: result,
          });

          successCount++;
          logger.log(`✅ Payment ${paymentId} confirmed successfully`);
        } catch (error) {
          // Error natijani qaytarish
          logger.error(`❌ Error confirming payment ${paymentId}:`, error);
          logger.error(`❌ Error details:`, {
            message: (error as Error).message,
            stack: (error as Error).stack,
          });

          results.push({
            paymentId,
            status: "error",
            message:
              (error as Error).message || "To'lovni tasdiqlashda xatolik",
            error: {
              name: (error as Error).name,
              message: (error as Error).message,
            },
          });

          errorCount++;
        }
      }

      logger.log("🎉 === PAYMENTS CONFIRMATION COMPLETED ===");
      logger.log("📊 Results:", {
        total: paymentIds.length,
        success: successCount,
        errors: errorCount,
      });

      return {
        success: errorCount === 0,
        message:
          errorCount === 0
            ? "Barcha to'lovlar muvaffaqiyatli tasdiqlandi"
            : `${successCount} ta to'lov tasdiqlandi, ${errorCount} ta xatolik`,
        results,
        summary: {
          total: paymentIds.length,
          success: successCount,
          errors: errorCount,
        },
      };
    } catch (error) {
      logger.error("❌ Error confirming payments:", error);
      logger.error("❌ Error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * To'lovni rad etish
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 9.5
   */
  async rejectPayment(paymentId: string, reason: string, user: IJwtUser) {
    try {
      logger.log("❌ === REJECTING PAYMENT (CASH) ===");
      logger.log("📋 Payment ID:", paymentId);
      logger.log("📝 Reason:", reason);
      logger.log("👤 User:", {
        id: user.sub,
        name: user.name,
        role: user.role,
      });

      // Validation
      if (!paymentId) {
        logger.warn("⚠️ Payment ID not provided");
        throw BaseError.BadRequest("To'lov ID si kiritilmagan");
      }

      if (!reason || reason.trim().length === 0) {
        logger.warn("⚠️ Rejection reason not provided");
        throw BaseError.BadRequest("Rad etish sababi kiritilmagan");
      }

      // To'lovni rad etish
      const result = await paymentService.rejectPayment(
        paymentId,
        reason,
        user
      );

      logger.log("✅ Payment rejected successfully");
      logger.log("📊 Result:", {
        paymentId,
        status: result.status,
        message: result.message,
      });

      return result;
    } catch (error) {
      logger.error("❌ Error rejecting payment:", error);
      logger.error("❌ Error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }
}

export default new CashService();
