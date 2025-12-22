import BaseError from "../../utils/base.error";
import Contract, { ContractStatus } from "../../schemas/contract.schema";
import IJwtUser from "../../types/user";
import { Debtor } from "../../schemas/debtor.schema";
import Payment from "../../schemas/payment.schema";
import logger from "../../utils/logger";

class DebtorService {
  /**
   * Qarzdorlarni ko'rish (Mijozlar bo'yicha guruhlangan)
   * Requirements: 7.2
   *
   * LOGIKA:
   * - Barcha faol shartnomalarni mijozlar bo'yicha guruhlaydi
   * - Har bir mijoz uchun:
   *   - Faol shartnomalar soni
   *   - Umumiy narx (barcha shartnomalar)
   *   - To'langan summa (barcha shartnomalar)
   *   - Qoldiq summa (barcha shartnomalar)
   *   - Keyingi to'lov sanasi (eng yaqin)
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
        { $sort: { totalDebt: -1 } },
      ]);
      return debtors;
    } catch (error) {
      logger.error("Error fetching debtors report:", error);
      throw BaseError.InternalServerError(String(error));
    }
  }

  /**
   * Muddati o'tgan shartnomalarni olish (Qarzdorliklar)
   * Requirements: 3.1
   *
   * LOGIKA:
   * - Faqat muddati o'tgan shartnomalarni ko'rsatadi (nextPaymentDate < bugun)
   * - Agar sana oralig'i berilsa, o'sha oralig'dagi muddati o'tgan shartnomalar
   * - Agar sana berilmasa, bugungi kungacha muddati o'tgan barcha shartnomalar
   */
  async getContract(startDate: string, endDate: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ✅ Foydalanuvchi tanlagan sana (kalendardan)
      const filterDate = endDate ? new Date(endDate) : today;
      filterDate.setHours(23, 59, 59, 999);

      const isFiltered = !!(startDate && endDate);

      return await Contract.aggregate([
        {
          $match: {
            isDeleted: false,
            isActive: true,
            isDeclare: false,
            status: ContractStatus.ACTIVE,
            // Agarda filtr bo'lsa, nextPaymentDate filtrDate dan kichik bo'lgan hammani olamiz
            nextPaymentDate: { $lte: filterDate }
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
            // ✅ Tanlangan oydagi "Kutilayotgan to'lov sanasi" (Virtual Due Date)
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
        {
          $addFields: {
            // ✅ Shu aniq bir oy uchun to'lov qilinganmi?
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
            },
            // ✅ Eng birinchi muddati o'tgan to'lov (standart holat uchun)
            firstOverduePaymentDate: {
              $let: {
                vars: {
                  overduePayments: {
                    $filter: {
                      input: "$paymentDetails",
                      as: "p",
                      cond: {
                        $and: [
                          { $eq: ["$$p.isPaid", false] },
                          { $lt: ["$$p.date", today] },
                        ],
                      },
                    },
                  },
                },
                in: { $min: "$$overduePayments.date" }
              }
            }
          }
        },
        {
          $addFields: {
            // ✅ Qaysi sanadan boshlab kechikishni hisoblaymiz?
            effectiveStartDate: {
              $cond: [
                { $and: [{ $literal: isFiltered }, { $lt: ["$virtualDueDate", filterDate] }] },
                "$virtualDueDate", // Filtr bo'lsa -> Oylik rejadan (masalan 18-dekabr)
                { $ifNull: ["$firstOverduePaymentDate", "$nextPaymentDate"] } // Filtr bo'lmasa -> Haqiqiy eng birinchi qarzdorlikdan
              ]
            }
          }
        },
        {
          $addFields: {
            // ✅ Yakuniy kechikkan kunlar
            delayDays: {
              $max: [
                0,
                {
                  $dateDiff: {
                    startDate: "$effectiveStartDate",
                    endDate: filterDate,
                    unit: "day",
                  },
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
   * Requirements: 3.1
   */
  async declareDebtors(user: IJwtUser, contractIds: string[]) {
    try {
      logger.debug("📢 === DECLARING DEBTORS (MANUAL) ===");

      const contracts = await Contract.find({
        _id: { $in: contractIds },
      });

      if (contracts.length === 0) {
        throw BaseError.BadRequest(
          "E'lon qilish uchun mos qarzdorliklar topilmadi"
        );
      }

      let createdCount = 0;

      for (const contract of contracts) {
        contract.isDeclare = true;
        await contract.save();

        // Debtor yaratishdan oldin mavjudligini tekshirish
        const existingDebtor = await Debtor.findOne({
          contractId: contract._id,
        });

        if (!existingDebtor) {
          const today = new Date();
          const overdueDays = Math.floor(
            (today.getTime() - contract.nextPaymentDate.getTime()) /
            (1000 * 60 * 60 * 24)
          );

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

      logger.debug(`✅ Created ${createdCount} debtors`);

      return { message: "Qarzdorlar e'lon qilindi.", created: createdCount };
    } catch (error) {
      logger.error("❌ Error declaring debtors:", error);
      throw error;
    }
  }

  /**
   * Avtomatik qarzdorlar yaratish (har kecha 00:00)
   * Requirements: 3.1, 3.5
   */
  async createOverdueDebtors() {
    try {
      logger.debug("🤖 === AUTOMATIC DEBTOR CREATION ===");
      const today = new Date();

      // Muddati o'tgan shartnomalarni topish
      const overdueContracts = await Contract.find({
        isActive: true,
        isDeleted: false,
        isDeclare: false,
        status: ContractStatus.ACTIVE,
        nextPaymentDate: { $lte: today },
      });

      logger.debug(`📋 Found ${overdueContracts.length} overdue contracts`);

      let createdCount = 0;

      for (const contract of overdueContracts) {
        // Ushbu shartnoma uchun mavjud Debtor'ni tekshirish
        const existingDebtor = await Debtor.findOne({
          contractId: contract._id,
        });

        if (!existingDebtor) {
          const overdueDays = Math.floor(
            (today.getTime() - contract.nextPaymentDate.getTime()) /
            (1000 * 60 * 60 * 24)
          );

          logger.debug(`📊 Contract ${contract._id}:`);
          logger.debug(`   Today: ${today.toISOString().split("T")[0]}`);
          logger.debug(
            `   Next Payment: ${contract.nextPaymentDate.toISOString().split("T")[0]
            }`
          );
          logger.debug(`   Overdue Days: ${overdueDays}`);

          await Debtor.create({
            contractId: contract._id,
            debtAmount: contract.monthlyPayment,
            dueDate: contract.nextPaymentDate,
            overdueDays: Math.max(0, overdueDays),
            createBy: contract.createBy,
          });

          createdCount++;
          logger.debug(`✅ Debtor created for contract: ${contract._id}`);
        }
      }

      logger.debug(
        `🎉 Created ${createdCount} new debtors for overdue contracts`
      );
      return { created: createdCount };
    } catch (error) {
      logger.error("❌ Error creating overdue debtors:", error);
      throw BaseError.InternalServerError("Qarzdorlar yaratishda xatolik");
    }
  }
}

export default new DebtorService();
