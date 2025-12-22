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
      today.setHours(0, 0, 0, 0); // Bugungi kunning boshi

      let dateFilter: any = {};

      if (startDate && endDate) {
        // Sana oralig'i berilgan - o'sha oralig'dagi muddati o'tgan shartnomalar
        dateFilter = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      } else {
        // Sana berilmagan - bugungi kundan oldingi barcha shartnomalar (muddati o'tgan)
        dateFilter = { $lt: today };
      }

      logger.debug("📅 Qarzdorliklar filter:", {
        today: today.toISOString().split("T")[0],
        todayFull: today.toISOString(),
        dateFilter,
      });

      return await Contract.aggregate([
        {
          $match: {
            isDeleted: false,
            isActive: true,
            isDeclare: false,
            status: ContractStatus.ACTIVE,
            // ✅ TUZATISH: nextPaymentDate filtrni tanlangan sanagacha bo'lgan barcha qarzlarni qamraydigan qilish
            nextPaymentDate: startDate && endDate
              ? { $lte: new Date(endDate) }
              : { $lt: today },
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
        // MUHIM: Faqat qarzdori bor shartnomalarni filtrlash
        {
          $match: {
            remainingDebt: { $gt: 0 },
          },
        },
        {
          $addFields: {
            // ✅ TUZATISH: To'lanmagan eng birinchi oyni topish uchun payment'larni tekshirish
            // ❌ESKI MUAMMO: Bu birinchi to'lanmagan to'lovni topadi, lekin bugungi sanaga nisbatan kechikishni hisoblaydi
            // ✅ YANGI YECHIM: Faqat kechikkan (muddati o'tgan) to'lanmagan to'lovlarni topish
            firstOverduePaymentDate: {
              $let: {
                vars: {
                  // Faqat to'lanmagan VA muddati o'tgan to'lovlar
                  overduePayments: {
                    $filter: {
                      input: "$paymentDetails",
                      as: "p",
                      cond: {
                        $and: [
                          { $eq: ["$$p.isPaid", false] },
                          { $lt: ["$$p.date", today] }, // ✅ Faqat muddati o'tgan
                        ],
                      },
                    },
                  },
                },
                in: {
                  $min: {
                    $map: {
                      input: "$$overduePayments",
                      as: "up",
                      in: "$$up.date",
                    },
                  },
                },
              },
            },
          },
        },
        {
          $addFields: {
            // ✅ YANGI: Faqat kechikkan to'lovlar bo'lsa, eng birinchisidan hisoblash
            // Aks holda nextPaymentDate dan hisoblash (eski logika)
            effectivePaymentDate: {
              $ifNull: ["$firstOverduePaymentDate", "$nextPaymentDate"],
            },
          },
        },
        {
          $addFields: {
            // ✅ KECHIKKAN KUNLARNI HISOBLASH (DELAY DAYS)
            delayDays: {
              $let: {
                vars: {
                  // Agar kalendardan sana tanlangan bo'lsa (endDate), o'sha sanani ishlatamiz
                  // Aks holda bugungi sanani ishlatamiz
                  currentReferenceDate: {
                    $ifNull: [
                      { $literal: endDate ? new Date(endDate) : null },
                      new Date()
                    ]
                  },
                  // Agar kalendar tanlangan bo'lsa, o'sha oyning to'lov kunini (originalPaymentDay) aniqlaymiz
                  // Masalan: originalPaymentDay = 18, tanlangan oy = Dekabr bo'lsa -> 18.12.2025
                  virtualDueDate: {
                    $let: {
                      vars: {
                        refDate: { $ifNull: [{ $literal: endDate ? new Date(endDate) : null }, new Date()] }
                      },
                      in: {
                        $dateFromParts: {
                          year: { $year: "$$refDate" },
                          month: { $month: "$$refDate" },
                          day: { $ifNull: ["$originalPaymentDay", { $dayOfMonth: "$startDate" }] },
                          timezone: "Asia/Tashkent"
                        }
                      }
                    }
                  }
                },
                in: {
                  $let: {
                    vars: {
                      // Agar kalendar tanlangan bo'lsa va bu oy uchun to'lov sanasi o'tib ketgan bo'lsa -> virtualDueDate'dan hisobla
                      // Aks holda haqiqiy eng birinchi kechikkan kundan (effectivePaymentDate) hisobla
                      calculationStartDate: {
                        $cond: [
                          { $and: [{ $literal: !!endDate }, { $gt: ["$$currentReferenceDate", "$$virtualDueDate"] }] },
                          "$$virtualDueDate",
                          "$effectivePaymentDate"
                        ]
                      }
                    },
                    in: {
                      $max: [
                        0,
                        {
                          $dateDiff: {
                            startDate: "$$calculationStartDate",
                            endDate: "$$currentReferenceDate",
                            unit: "day",
                          },
                        }
                      ]
                    }
                  }
                }
              }
            },
          },
        },
        {
          $project: {
            _id: 1, // Shartnoma ID'sini saqlab qolish
            contractId: "$_id", // Shartnoma ID'si
            customerId: "$customer._id", // Mijoz ID'si
            fullName: {
              $concat: ["$customer.firstName", " ", "$customer.lastName"],
            },
            phoneNumber: "$customer.phoneNumber",
            manager: {
              $concat: [
                { $ifNull: ["$manager.firstName", ""] },
                " ",
                { $ifNull: ["$manager.lastName", ""] },
              ],
            },
            totalPrice: 1,
            totalPaid: 1,
            remainingDebt: 1,
            nextPaymentDate: 1,
            productName: 1,
            startDate: 1,
            delayDays: 1,
            initialPayment: 1,
          },
        },
        { $sort: { nextPaymentDate: 1 } }, // To'g'ri field nomi
      ]);
    } catch (error) {
      logger.error("Error fetching contracts by payment date:", error);
      throw BaseError.InternalServerError(
        "Shartnomalarni olishda xatolik yuz berdi"
      );
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
