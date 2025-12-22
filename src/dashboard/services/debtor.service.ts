import BaseError from "../../utils/base.error";
import Contract, { ContractStatus } from "../../schemas/contract.schema";
import IJwtUser from "../../types/user";
import { Debtor } from "../../schemas/debtor.schema";
import Payment, { PaymentType } from "../../schemas/payment.schema";
import logger from "../../utils/logger";

class DebtorService {
  /**
   * Qarzdorlarni ko'rish (Mijozlar bo'yicha guruhlangan)
   * Requirements: 7.2
   */
  async getDebtors() {
    try {
      const debtors = await Contract.aggregate([
        {
          $match: {
            isActive: true,
            isDeleted: false,
            status: ContractStatus.ACTIVE,
          },
        },
        {
          $lookup: {
            from: "customers",
            localField: "customer",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: "$customer" },
        {
          $lookup: {
            from: "employees",
            localField: "customer.manager",
            foreignField: "_id",
            as: "manager",
          },
        },
        {
          $unwind: {
            path: "$manager",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "payments",
            localField: "payments",
            foreignField: "_id",
            as: "paymentDetails",
          },
        },
        {
          $addFields: {
            totalPaid: {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: "$paymentDetails",
                      as: "p",
                      cond: { $eq: ["$$p.isPaid", true] },
                    },
                  },
                  as: "pp",
                  in: "$$pp.amount",
                },
              },
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
        {
          $group: {
            _id: "$customer._id",
            firstName: { $first: "$customer.firstName" },
            lastName: { $first: "$customer.lastName" },
            phoneNumber: { $first: "$customer.phoneNumber" },
            managerFirstName: { $first: "$manager.firstName" },
            managerLastName: { $first: "$manager.lastName" },
            activeContractsCount: { $sum: 1 },
            totalPrice: { $sum: "$totalPrice" },
            totalPaid: { $sum: "$totalPaid" },
            remainingDebt: { $sum: "$remainingDebt" },
            nextPaymentDate: { $min: "$nextPaymentDate" },
          },
        },
        {
          $project: {
            _id: 1,
            fullName: {
              $concat: ["$firstName", " ", "$lastName"],
            },
            phoneNumber: 1,
            manager: {
              $concat: [
                { $ifNull: ["$managerFirstName", ""] },
                " ",
                { $ifNull: ["$managerLastName", ""] },
              ],
            },
            totalPrice: 1,
            totalPaid: 1,
            remainingDebt: 1,
            nextPaymentDate: 1,
            activeContractsCount: 1,
          },
        },
        { $sort: { remainingDebt: -1 } },
      ]);
      return debtors;
    } catch (error) {
      logger.error("Error fetching debtors report:", error);
      throw BaseError.InternalServerError(String(error));
    }
  }

  /**
   * Muddati o'tgan shartnomalarni olish (Qarzdorliklar)
   * Detailed implementation based on the user prompt
   */
  async getContract(startDate: string, endDate: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const filterDate = endDate ? new Date(endDate) : today;
      filterDate.setHours(23, 59, 59, 999);

      const isFiltered = !!(startDate && endDate);

      return await Contract.aggregate([
        // 1. Initial match
        {
          $match: {
            isDeleted: false,
            isActive: true,
            isDeclare: false,
            status: ContractStatus.ACTIVE,
          },
        },
        // 2. Lookups
        {
          $lookup: {
            from: "customers",
            localField: "customer",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: "$customer" },
        {
          $lookup: {
            from: "employees",
            localField: "customer.manager",
            foreignField: "_id",
            as: "manager",
          },
        },
        {
          $unwind: {
            path: "$manager",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "payments",
            localField: "payments",
            foreignField: "_id",
            as: "paymentDetails",
          },
        },
        // 3. Calculate virtualDueDate
        {
          $addFields: {
            virtualDueDate: {
              $dateFromParts: {
                year: { $year: filterDate },
                month: { $month: filterDate },
                day: { $ifNull: ["$originalPaymentDay", { $dayOfMonth: "$startDate" }] },
                timezone: "Asia/Tashkent"
              }
            }
          }
        },
        // 4. Check isPaidForTargetMonth
        {
          $addFields: {
            isPaidForTargetMonth: {
              $anyElementTrue: {
                $map: {
                  input: "$paymentDetails",
                  as: "p",
                  in: {
                    $and: [
                      { $eq: ["$$p.isPaid", true] },
                      { $eq: [{ $year: "$$p.date" }, { $year: filterDate }] },
                      { $eq: [{ $month: "$$p.date" }, { $month: filterDate }] }
                    ]
                  }
                }
              }
            }
          }
        },
        // 5. New $match stage for month filtering
        {
          $match: {
            $expr: {
              $cond: [
                { $literal: isFiltered },
                {
                  $and: [
                    { $lte: ["$virtualDueDate", filterDate] },
                    { $eq: ["$isPaidForTargetMonth", false] }
                  ]
                },
                { $lte: ["$nextPaymentDate", filterDate] }
              ]
            }
          }
        },
        // 6. Calculate delayDays and other fields
        {
          $addFields: {
            delayDays: {
              $cond: [
                { $literal: isFiltered },
                {
                  $max: [
                    0,
                    {
                      $dateDiff: {
                        startDate: "$virtualDueDate",
                        endDate: filterDate,
                        unit: "day",
                      },
                    }
                  ]
                },
                {
                  $max: [
                    0,
                    {
                      $dateDiff: {
                        startDate: "$nextPaymentDate",
                        endDate: today,
                        unit: "day",
                      },
                    }
                  ]
                }
              ]
            },
            totalPaid: {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: "$paymentDetails",
                      as: "p",
                      cond: { $eq: ["$$p.isPaid", true] },
                    },
                  },
                  as: "pp",
                  in: "$$pp.amount",
                },
              },
            },
          }
        },
        // 7. Rest of pipeline
        {
          $addFields: {
            remainingDebt: { $subtract: ["$totalPrice", "$totalPaid"] }
          }
        },
        {
          $match: {
            remainingDebt: { $gt: 0 }
          }
        },
        {
          $project: {
            _id: 1,
            contractId: "$_id",
            customerId: "$customer._id",
            fullName: { $concat: ["$customer.firstName", " ", "$customer.lastName"] },
            phoneNumber: "$customer.phoneNumber",
            manager: { $concat: [{ $ifNull: ["$manager.firstName", ""] }, " ", { $ifNull: ["$manager.lastName", ""] }] },
            totalPrice: 1,
            totalPaid: 1,
            remainingDebt: 1,
            nextPaymentDate: 1,
            productName: 1,
            startDate: 1,
            delayDays: 1,
            initialPayment: 1
          },
        },
        { $sort: { delayDays: -1 } }
      ]);
    } catch (error) {
      logger.error("Error fetching contracts by payment date:", error);
      throw BaseError.InternalServerError("Shartnomalarni olishda xatolik yuz berdi");
    }
  }

  /**
   * Qarzdorlarni e'lon qilish (manual)
   */
  async declareDebtors(user: IJwtUser, contractIds: string[]) {
    try {
      const contracts = await Contract.find({ _id: { $in: contractIds } });
      let createdCount = 0;
      for (const contract of contracts) {
        contract.isDeclare = true;
        await contract.save();
        const existingDebtor = await Debtor.findOne({ contractId: contract._id });
        if (!existingDebtor) {
          const today = new Date();
          const overdueDays = Math.floor((today.getTime() - contract.nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
          await Debtor.create({
            contractId: contract._id,
            debtAmount: contract.monthlyPayment,
            dueDate: contract.nextPaymentDate,
            overdueDays: Math.max(0, overdueDays),
            createBy: user.sub,
          });
          createdCount++;
        }
      }
      return { message: "Qarzdorlar e'lon qilindi.", created: createdCount };
    } catch (error) {
      logger.error("❌ Error declaring debtors:", error);
      throw error;
    }
  }

  /**
   * Avtomatik qarzdorlar yaratish (har kecha 00:00)
   */
  async createOverdueDebtors() {
    try {
      const today = new Date();
      const overdueContracts = await Contract.find({
        isActive: true,
        isDeleted: false,
        isDeclare: false,
        status: ContractStatus.ACTIVE,
        nextPaymentDate: { $lte: today },
      });
      let createdCount = 0;
      for (const contract of overdueContracts) {
        const existingDebtor = await Debtor.findOne({ contractId: contract._id });
        if (!existingDebtor) {
          const overdueDays = Math.floor((today.getTime() - contract.nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
          await Debtor.create({
            contractId: contract._id,
            debtAmount: contract.monthlyPayment,
            dueDate: contract.nextPaymentDate,
            overdueDays: Math.max(0, overdueDays),
            createBy: contract.createBy,
          });
          createdCount++;
        }
      }
      return { created: createdCount };
    } catch (error) {
      logger.error("❌ Error creating overdue debtors:", error);
      throw BaseError.InternalServerError("Qarzdorlar yaratishda xatolik");
    }
  }
}

export default new DebtorService();
