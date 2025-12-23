import Contract, { ContractStatus } from "../../schemas/contract.schema";
import Customer from "../../schemas/customer.schema";
import BaseError from "../../utils/base.error";
import { CreateContractDtoForSeller } from "../validators/contract";
import { Balance } from "../../schemas/balance.schema";
import { Debtor } from "../../schemas/debtor.schema";
import Employee from "../../schemas/employee.schema";
import Payment, { PaymentStatus } from "../../schemas/payment.schema";
import { Types } from "mongoose";
import logger from "../../utils/logger";

class ContractService {
  // To'lovlarni qayta hisoblash funksiyasi
  async recalculatePayments(
    contractId: string,
    newMonthlyPayment: number,
    newInitialPayment?: number
  ) {
    try {
      logger.debug("🔄 Recalculating payments for contract:", contractId);

      const contract = await Contract.findById(contractId).populate("payments");
      if (!contract || !contract.payments) {
        return;
      }

      const payments = (contract.payments as any[]).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Birinchi to'lov (initial payment) ni yangilash
      if (newInitialPayment && payments[0]) {
        const firstPayment = await Payment.findById(payments[0]._id);
        if (firstPayment) {
          firstPayment.amount = newInitialPayment;
          firstPayment.expectedAmount = newInitialPayment;
          firstPayment.status = PaymentStatus.PAID;
          await firstPayment.save();
          logger.debug("✅ Initial payment updated:", newInitialPayment);
        }
      }

      // Oylik to'lovlarni tekshirish va yangilash
      for (let i = 1; i < payments.length; i++) {
        const payment = await Payment.findById(payments[i]._id);
        if (!payment) continue;

        payment.expectedAmount = newMonthlyPayment;

        if (payment.isPaid) {
          // To'langan to'lovni tekshirish
          const diff = payment.amount - newMonthlyPayment;

          if (Math.abs(diff) < 0.01) {
            // To'g'ri to'langan
            payment.status = PaymentStatus.PAID;
            payment.remainingAmount = 0;
            payment.excessAmount = 0;
          } else if (diff < 0) {
            // Kam to'langan
            payment.status = PaymentStatus.UNDERPAID;
            payment.remainingAmount = Math.abs(diff);
            payment.excessAmount = 0;
            logger.debug(
              `⚠️ Payment ${i} underpaid: ${payment.amount} < ${newMonthlyPayment}, remaining: ${payment.remainingAmount}`
            );
          } else {
            // Ko'p to'langan
            payment.status = PaymentStatus.OVERPAID;
            payment.excessAmount = diff;
            payment.remainingAmount = 0;
            logger.debug(
              `ℹ️ Payment ${i} overpaid: ${payment.amount} > ${newMonthlyPayment}, excess: ${payment.excessAmount}`
            );
          }
        } else {
          // To'lanmagan - yangi oylik bilan yangilash
          payment.amount = newMonthlyPayment;
          payment.status = PaymentStatus.PENDING;
          payment.remainingAmount = 0;
          payment.excessAmount = 0;
        }

        await payment.save();
      }

      logger.debug("✅ Payments recalculated successfully");
    } catch (error) {
      logger.error("❌ Error recalculating payments:", error);
      throw error;
    }
  }

  // Balansni yangilash funksiyasi
  async updateBalance(
    managerId: any,
    changes: {
      dollar?: number;
      sum?: number;
    }
  ) {
    const balance = await Balance.findOne({ managerId });

    if (!balance) {
      return await Balance.create({
        managerId,
        dollar: changes.dollar || 0,
        sum: changes.sum || 0,
      });
    }

    balance.dollar += changes.dollar || 0;
    if (balance.sum !== undefined && changes.sum !== undefined) {
      balance.sum += changes.sum;
    }

    return await balance.save();
  }

  // Faol shartnomalarni ko'rish
  async getActiveContracts(userId: string) {
    logger.debug("🔍 Getting active contracts for user:", userId);
    const result = await Contract.aggregate([
      {
        $match: {
          isDeleted: false,
          isActive: true,
          status: ContractStatus.ACTIVE,
        },
      },
      {
        $lookup: {
          from: "notes",
          localField: "notes",
          foreignField: "_id",
          as: "notes",
          pipeline: [{ $project: { text: 1 } }],
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
          pipeline: [
            {
              $project: {
                firstName: 1,
                lastName: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, null] },
          customer: {
            $cond: [
              { $gt: [{ $size: "$customer" }, 0] },
              { $toString: { $arrayElemAt: ["$customer._id", 0] } },
              null,
            ],
          },
          customerName: {
            $cond: [
              { $gt: [{ $size: "$customer" }, 0] },
              {
                $concat: [
                  {
                    $dateToString: {
                      format: "%d",
                      date: "$startDate",
                    },
                  },
                  " ",
                  { $arrayElemAt: ["$customer.fullName", 0] },
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
    logger.debug("✅ Found active contracts:", result.length);
    return result;
  }

  // Yangi shartnomalarni ko'rish
  async getNewContracts(userId: string) {
    logger.debug("🔍 Getting new contracts for user:", userId);
    const result = await Contract.aggregate([
      {
        $match: {
          isDeleted: false,
          isActive: false,
          status: ContractStatus.ACTIVE,
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
          pipeline: [
            {
              $lookup: {
                from: "employees",
                localField: "manager",
                foreignField: "_id",
                as: "manager",
              },
            },
            { $unwind: { path: "$manager", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                firstName: 1,
                lastName: 1,
                passportSeries: 1,
                phoneNumber: 1,
                birthDate: 1,
                telegramName: 1,
                isActive: 1,
                address: 1,
                _id: 1,
                isDeleted: 1,
                "manager.firstName": 1,
                "manager.lastName": 1,
                "manager._id": 1,
              },
            },
          ],
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "notes",
          localField: "notes",
          foreignField: "_id",
          as: "notes",
          pipeline: [{ $project: { text: 1 } }],
        },
      },
      {
        $addFields: {
          customerName: "$customer.fullName",
          notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, null] },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
    logger.debug("✅ Found new contracts:", result.length);
    return result;
  }

  // Yopilgan shartnomalarni ko'rish
  async getCompletedContracts(userId: string) {
    return await Contract.aggregate([
      {
        $match: {
          isDeleted: false,
          isActive: true,
          status: ContractStatus.COMPLETED,
        },
      },
      {
        $lookup: {
          from: "notes",
          localField: "notes",
          foreignField: "_id",
          as: "notes",
          pipeline: [{ $project: { text: 1 } }],
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
          pipeline: [
            {
              $project: {
                firstName: 1,
                lastName: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, null] },
          customer: {
            $cond: [
              { $gt: [{ $size: "$customer" }, 0] },
              { $toString: { $arrayElemAt: ["$customer._id", 0] } },
              null,
            ],
          },
          customerName: {
            $cond: [
              { $gt: [{ $size: "$customer" }, 0] },
              { $arrayElemAt: ["$customer.fullName", 0] },
              null,
            ],
          },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
  }

  // Shartnoma detailini ko'rish
  async getContractById(contractId: string, userId: string) {
    const contract = await Contract.aggregate([
      {
        $match: {
          isDeleted: false,
          _id: new Types.ObjectId(contractId),
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
          pipeline: [
            {
              $lookup: {
                from: "employees",
                localField: "manager",
                foreignField: "_id",
                as: "manager",
              },
            },
            { $unwind: { path: "$manager", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                firstName: 1,
                lastName: 1,
                passportSeries: 1,
                phoneNumber: 1,
                birthDate: 1,
                telegramName: 1,
                isActive: 1,
                address: 1,
                _id: 1,
                isDeleted: 1,
                "manager.firstName": 1,
                "manager.lastName": 1,
                "manager._id": 1,
              },
            },
          ],
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "notes",
          localField: "notes",
          foreignField: "_id",
          as: "notes",
          pipeline: [{ $project: { text: 1 } }],
        },
      },
      {
        $addFields: {
          notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, null] },
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "payments",
          foreignField: "_id",
          as: "payments",
          pipeline: [
            {
              $lookup: {
                from: "notes",
                localField: "notes",
                foreignField: "_id",
                as: "notes",
                pipeline: [{ $project: { text: 1 } }],
              },
            },
            {
              $addFields: {
                notes: {
                  $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, ""],
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          totalPaid: {
            $add: [
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$payments",
                        as: "p",
                        cond: { $eq: ["$$p.isPaid", true] },
                      },
                    },
                    as: "pp",
                    in: "$$pp.amount",
                  },
                },
              },
              "$initialPayment",
            ],
          },
        },
      },
      {
        $addFields: {
          remainingDebt: {
            $subtract: ["$totalPrice", "$totalPaid"],
          },
        },
      },
      // ✅ editHistory.editedBy ni populate qilish
      {
        $lookup: {
          from: "employees",
          localField: "editHistory.editedBy",
          foreignField: "_id",
          as: "editHistoryEmployees",
        },
      },
      {
        $addFields: {
          editHistory: {
            $map: {
              input: "$editHistory",
              as: "edit",
              in: {
                date: "$$edit.date",
                editedBy: {
                  $let: {
                    vars: {
                      employee: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$editHistoryEmployees",
                              as: "emp",
                              cond: { $eq: ["$$emp._id", "$$edit.editedBy"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: "$$employee._id",
                      firstName: "$$employee.firstName",
                      lastName: "$$employee.lastName",
                    },
                  },
                },
                changes: "$$edit.changes",
                affectedPayments: "$$edit.affectedPayments",
                impactSummary: "$$edit.impactSummary",
              },
            },
          },
        },
      },
    ]);

    if (!contract || contract.length === 0) {
      throw BaseError.NotFoundError(
        "Shartnoma topilmadi yoki sizga tegishli emas"
      );
    }

    return contract[0];
  }

  // Shartnomani tahrirlash (CASCADE UPDATE)
  async updateContract(contractId: string, data: any, userId: string) {
    try {
      logger.debug("🔄 === CONTRACT UPDATE STARTED ===");
      logger.debug("📋 Contract ID:", contractId);

      const contract = await Contract.findOne({
        _id: contractId,
        isDeleted: false,
      })
        .populate("notes")
        .populate("payments");

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      logger.debug("📊 Old values:", {
        initialPayment: contract.initialPayment,
        totalPrice: contract.totalPrice,
        monthlyPayment: contract.monthlyPayment,
      });

      logger.debug("📊 New values:", {
        initialPayment: data.initialPayment,
        totalPrice: data.totalPrice,
        monthlyPayment: data.monthlyPayment,
      });

      // 1. Initial Payment o'zgarganini tekshirish
      const oldInitialPayment = contract.initialPayment || 0;
      const newInitialPayment = data.initialPayment || 0;
      const initialPaymentDiff = newInitialPayment - oldInitialPayment;

      logger.debug("💰 Initial payment difference:", initialPaymentDiff);

      // 2. Agar initial payment o'zgargan bo'lsa, Payment collection'ni yangilash
      if (
        initialPaymentDiff !== 0 &&
        contract.payments &&
        contract.payments.length > 0
      ) {
        const Payment = await import("../../schemas/payment.schema");

        // Birinchi to'lovni topish (initial payment)
        const firstPayment = await Payment.default.findById(
          contract.payments[0]
        );

        if (firstPayment) {
          const oldAmount = firstPayment.amount;
          firstPayment.amount = newInitialPayment;
          await firstPayment.save();

          logger.debug(
            `✅ Initial payment updated: ${oldAmount} -> ${newInitialPayment}`
          );

          // 3. Balance'ni yangilash
          const customer = await Customer.findById(contract.customer).populate(
            "manager"
          );
          if (customer && customer.manager) {
            await this.updateBalance(customer.manager._id, {
              dollar: initialPaymentDiff,
              sum: 0,
            });
            logger.debug(
              `💵 Balance updated for manager: ${customer.manager._id}, diff: ${initialPaymentDiff}`
            );
          }
        }
      }

      // 4. Monthly payment o'zgarganini tekshirish va Debtor'ni yangilash
      const oldMonthlyPayment = contract.monthlyPayment || 0;
      const newMonthlyPayment = data.monthlyPayment || 0;

      if (oldMonthlyPayment !== newMonthlyPayment) {
        logger.debug(
          `📅 Monthly payment changed: ${oldMonthlyPayment} -> ${newMonthlyPayment}`
        );

        // Debtor'ni yangilash
        await Debtor.updateMany(
          { contractId: contract._id },
          { debtAmount: newMonthlyPayment }
        );
        logger.debug("⚠️ Debtors updated with new monthly payment");

        // To'lovlarni qayta hisoblash
        await this.recalculatePayments(
          String(contract._id),
          newMonthlyPayment,
          initialPaymentDiff !== 0 ? newInitialPayment : undefined
        );
      } else if (initialPaymentDiff !== 0) {
        // Faqat initial payment o'zgargan bo'lsa
        await this.recalculatePayments(
          String(contract._id),
          newMonthlyPayment,
          newInitialPayment
        );
      }

      // 5. Notes yangilash
      if (data.notes && contract.notes) {
        contract.notes.text = data.notes;
        await contract.notes.save();
      }

      // 6. Keyingi to'lov sanasini hisoblash (startDate dan 1 oy keyin)
      const nextPaymentDate = new Date(contract.startDate);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      // 7. Shartnoma ma'lumotlarini yangilash
      const updatedContract = await Contract.findOneAndUpdate(
        { _id: contractId, isDeleted: false },
        {
          productName: data.productName,
          originalPrice: data.originalPrice,
          price: data.price,
          initialPayment: data.initialPayment,
          percentage: data.percentage,
          period: data.period,
          monthlyPayment: data.monthlyPayment,
          totalPrice: data.totalPrice,
          initialPaymentDueDate: data.initialPaymentDueDate,
          nextPaymentDate: nextPaymentDate,
          info: {
            box: data.box || false,
            mbox: data.mbox || false,
            receipt: data.receipt || false,
            iCloud: data.iCloud || false,
          },
        },
        { new: true }
      );

      if (!updatedContract) {
        throw BaseError.NotFoundError("Shartnoma yangilanmadi");
      }

      logger.debug("🎉 === CONTRACT UPDATE COMPLETED ===");

      return {
        message: "Shartnoma va bog'liq ma'lumotlar muvaffaqiyatli yangilandi",
        contract: updatedContract,
        changes: {
          initialPaymentDiff,
          monthlyPaymentChanged: oldMonthlyPayment !== newMonthlyPayment,
        },
      };
    } catch (error) {
      logger.error("❌ === CONTRACT UPDATE FAILED ===");
      logger.error("Error:", error);
      throw error;
    }
  }

  async create(data: CreateContractDtoForSeller, userId?: string) {
    try {
      logger.debug(
        "🚀 SELLER === CONTRACT CREATION STARTED (PENDING APPROVAL) ==="
      );
      logger.debug("📋 Seller input:", {
        customer: data.customer,
        productName: data.productName,
        initialPayment: data.initialPayment,
      });

      const customer = await Customer.findById(data.customer);
      if (!customer) {
        throw BaseError.NotFoundError(`Bunday mijoz topilmadi!`);
      }

      const Employee = await import("../../schemas/employee.schema");
      const Notes = await import("../../schemas/notes.schema");

      const createBy = await Employee.default.findById(userId);
      if (!createBy) {
        throw BaseError.ForbiddenError("Mavjud bo'lmagan xodim");
      }
      logger.debug("👤 Seller found:", createBy._id);

      // Notes yaratish
      const newNotes = new Notes.default({
        text: data.notes || "Shartnoma yaratildi (Tasdiq kutilmoqda)",
        customer: data.customer,
        createBy: createBy._id,
      });
      await newNotes.save();
      logger.info("📝 Notes created:", newNotes._id);

      // Shartnoma yaratish - isActive: false (tasdiq kutilmoqda)
      const contractStartDate = data.startDate
        ? new Date(data.startDate)
        : new Date();
      const contract = new Contract({
        customer: data.customer,
        productName: data.productName,
        originalPrice: data.originalPrice,
        price: data.price,
        initialPayment: data.initialPayment,
        percentage: data.percentage,
        period: data.period,
        monthlyPayment: data.monthlyPayment,
        initialPaymentDueDate: new Date(
          data.initialPaymentDueDate || new Date()
        ),
        notes: newNotes._id,
        totalPrice: data.totalPrice,
        startDate: contractStartDate,
        nextPaymentDate: (() => {
          const nextDate = new Date(contractStartDate);
          nextDate.setMonth(nextDate.getMonth() + 1);
          return nextDate;
        })(),
        isActive: false, // ⚠️ Tasdiq kutilmoqda
        createBy: createBy._id,
        info: {
          box: data.box || false,
          mbox: data.mbox || false,
          receipt: data.receipt || false,
          iCloud: data.iCloud || false,
        },
        payments: [],
        isDeclare: false,
        status: ContractStatus.ACTIVE,
      });

      await contract.save();
      logger.debug("📋 Contract created (PENDING APPROVAL):", contract._id);
      logger.info("⏳ Waiting for Admin/Moderator/Manager approval...");
      logger.debug(
        "🎉 SELLER === CONTRACT CREATION COMPLETED (NO CASCADE YET) ==="
      );

      return {
        message:
          "Shartnoma yaratildi va tasdiq kutilmoqda. Admin/Moderator/Manager tomonidan tasdiqlanishi kerak.",
        contractId: contract._id,
        isActive: false,
        needsApproval: true,
      };
    } catch (error) {
      logger.error("❌ SELLER === CONTRACT CREATION FAILED ===");
      logger.error("Error:", error);
      throw error;
    }
  }

  async post(data: any) {
    const contract = new Contract({ ...data });
    await contract.save();
    return { message: "Shartnoma qo'shildi." };
  }
}

export default new ContractService();
