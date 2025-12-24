import Contract from "../../schemas/contract.schema";
import Customer from "../../schemas/customer.schema";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

import { Debtor } from "../../schemas/debtor.schema";
import BaseError from "../../utils/base.error";
import { Types } from "mongoose";

class CustomerService {
  async getAll(user: IJwtUser) {
    logger.debug("\n👥 === GETTING ALL CUSTOMERS ===");
    logger.debug("👤 Manager ID:", user.sub);

    // Debug: Barcha mijozlarni sanash
    const totalCustomers = await Customer.countDocuments({
      isActive: true,
      isDeleted: false,
    });
    logger.debug("📊 Total active customers:", totalCustomers);

    const managerCustomers = await Customer.countDocuments({
      isActive: true,
      isDeleted: false,
      manager: user.sub,
    });
    logger.debug("📊 Manager's customers:", managerCustomers);

    const customers = await Customer.find({
      isActive: true,
      isDeleted: false,
      manager: user.sub,
    }).select("fullName _id phoneNumber");

    logger.debug(`✅ Found ${customers.length} customers for manager`);

    if (customers.length > 0) {
      logger.debug("📋 Sample customer:", {
        fullName: customers[0].fullName,
        phoneNumber: customers[0].phoneNumber,
      });
    }
    logger.debug("=".repeat(50) + "\n");

    return {
      status: "success",
      data: customers,
    };
  }

  async getUnpaidDebtors(user: IJwtUser, filterDate?: string) {
    try {
      logger.debug("\n🔍 === GETTING UNPAID DEBTORS ===");
      logger.debug(`👤 Manager ID: ${user.sub}`);
      logger.debug(`📅 Filter date param: ${filterDate || 'none (using today)'}`);

      // ✅ Sodda logika: sana berilgan bo'lsa ishlatamiz, yo'q bo'lsa bugungi kun
      let filterEndDate: Date;
      
      if (filterDate && filterDate.trim() !== "") {
        // Sana formatini parse qilish: "YYYY-MM-DD"
        const [year, month, day] = filterDate.split('-').map(Number);
        filterEndDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        logger.debug(`📅 Using filter date: ${filterDate} -> ${filterEndDate.toISOString()}`);
      } else {
        // Default: bugungi kun
        filterEndDate = new Date();
        filterEndDate.setHours(23, 59, 59, 999);
        logger.debug(`📅 Using today: ${filterEndDate.toISOString()}`);
      }

      const managerId = new Types.ObjectId(user.sub);

      // ✅ WEB BILAN BIR XIL LOGIKA: nextPaymentDate tekshirish
      const result = await Contract.aggregate([
        // 1️⃣ Faol shartnomalarni filtrlash
        {
          $match: {
            isActive: true,
            isDeleted: false,
            status: "active",
          },
        },
        
        // 2️⃣ Mijozlarni join qilish
        {
          $lookup: {
            from: "customers",
            localField: "customer",
            foreignField: "_id",
            as: "customerData",
          },
        },
        { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: false } },
        
        // 3️⃣ Faqat o'z menejerining mijozlari
        {
          $match: {
            "customerData.manager": managerId,
            "customerData.isActive": true,
            "customerData.isDeleted": false,
          },
        },
        
        // 4️⃣ To'lovlarni join qilish
        {
          $lookup: {
            from: "payments",
            localField: "payments",
            foreignField: "_id",
            as: "paymentDetails",
          },
        },
        
        // 5️⃣ ✅ MUHIM FIX: nextPaymentDate mavjud va o'tgan bo'lsa → qarzdor
        {
          $match: {
            nextPaymentDate: { 
              $exists: true, 
              $ne: null, 
              $lte: filterEndDate 
            }
          }
        },
        
        // 6️⃣ To'langan summani hisoblash
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
                  in: { $ifNull: ["$$pp.actualAmount", "$$pp.amount"] },
                },
              },
            }
          },
        },
        
        // 7️⃣ Qolgan qarzni hisoblash
        {
          $addFields: {
            remainingDebt: {
              $subtract: [
                { $ifNull: ["$totalPrice", "$price"] }, 
                "$totalPaid"
              ],
            },
            delayDays: {
              $floor: {
                $divide: [
                  { $subtract: [filterEndDate, "$nextPaymentDate"] },
                  1000 * 60 * 60 * 24,
                ],
              },
            }
          }
        },
        
        // 8️⃣ Faqat qarzi bor shartnomalar
        {
          $match: { remainingDebt: { $gt: 0 } }
        },
        
        // 9️⃣ ✅ YANGI: Har bir shartnomani alohida qaytarish (mijoz bo'yicha guruhlash yo'q)
        // Bu orqali bir mijozning bir necha shartnomasi alohida ko'rinadi
        {
          $project: {
            _id: "$_id", // Contract ID
            customerId: "$customerData._id",
            fullName: "$customerData.fullName",
            phoneNumber: "$customerData.phoneNumber",
            productName: "$productName", // ✅ Shartnoma nomi
            contractId: "$_id", // ✅ Shartnoma ID (click uchun)
            remainingDebt: "$remainingDebt", // ✅ Shu shartnomaning qarzi
            delayDays: "$delayDays", // ✅ Shu shartnomaning kechikishi
            nextPaymentDate: "$nextPaymentDate",
            totalPrice: { $ifNull: ["$totalPrice", "$price"] },
            totalPaid: "$totalPaid",
            startDate: "$startDate", // ✅ KUN uchun kerak!
          },
        },
        
        // 🔟 Tartiblash: Eng ko'p kechikkan shartnoma birinchi
        { $sort: { delayDays: -1, remainingDebt: -1 } },
      ]);

      logger.debug(`✅ Found ${result.length} debtors`);
      
      if (result.length > 0) {
        logger.debug(`📊 Sample debtor:`, {
          name: result[0].fullName,
          totalDebt: result[0].totalDebt,
          delayDays: result[0].delayDays,
          overdueCount: result[0].totalOverdueCount
        });
      }
      
      return { status: "success", data: result };
    } catch (error) {
      logger.error("❌ getUnpaidDebtors error:", error);
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getPaidDebtors(user: IJwtUser) {
    try {
      logger.debug("\n💰 === GETTING CUSTOMERS WITH RECENT PAYMENTS ===");
      logger.debug("👤 Manager ID:", user.sub);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const managerId = new Types.ObjectId(user.sub);

      const result = await Contract.aggregate([
        {
          $match: {
            isActive: true,
            isDeleted: false,
            status: "active",
          },
        },
        {
          $lookup: {
            from: "customers",
            localField: "customer",
            foreignField: "_id",
            as: "customerData",
          },
        },
        { $unwind: "$customerData" },
        {
          $match: {
            "customerData.manager": managerId,
            "customerData.isActive": true,
            "customerData.isDeleted": false,
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
            recentPayments: {
              $filter: {
                input: "$paymentDetails",
                as: "p",
                cond: {
                  $and: [
                    { $eq: ["$$p.isPaid", true] },
                    { $gte: ["$$p.date", thirtyDaysAgo] },
                  ],
                },
              },
            },
          },
        },
        {
          $match: {
            "recentPayments.0": { $exists: true },
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
                  in: { $ifNull: ["$$pp.actualAmount", "$$pp.amount"] },
                },
              },
            },
            lastPaymentDate: {
              $max: "$recentPayments.date",
            },
          },
        },
        {
          $group: {
            _id: "$customerData._id",
            fullName: { $first: "$customerData.fullName" },
            phoneNumber: { $first: "$customerData.phoneNumber" },
            lastPaymentDate: { $max: "$lastPaymentDate" },
            totalPaid: { $sum: "$totalPaid" },
            totalPrice: { $sum: { $ifNull: ["$totalPrice", "$price"] } },
            contractsCount: { $sum: 1 },
          },
        },
        {
          $addFields: {
            remainingDebt: { $subtract: ["$totalPrice", "$totalPaid"] }
          }
        },
        { $sort: { lastPaymentDate: -1 } },
      ]);

      return { status: "success", data: result };
    } catch (error) {
      logger.error("❌ Error getting paid debtors:", error);
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getById(user: IJwtUser, customerId: string) {
    try {
      logger.debug("\n🔍 === GET CUSTOMER BY ID ===");
      logger.debug("📋 Customer ID:", customerId);
      logger.debug("👤 Manager ID:", user.sub);

      const customerData = await Customer.aggregate([
        {
          $match: {
            _id: new Types.ObjectId(customerId),
            isActive: true,
            isDeleted: false,
            manager: new Types.ObjectId(user.sub),
          },
        },
        {
          $lookup: {
            from: "contracts",
            localField: "_id",
            foreignField: "customer",
            as: "contracts",
          },
        },
        {
          $lookup: {
            from: "payments",
            let: { customerId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$customerId", "$$customerId"] }, // ✅ TUZATILDI: $$ ishlatildi
                      { $eq: ["$isPaid", true] },
                    ],
                  },
                },
              },
            ],
            as: "payments",
          },
        },
        {
          $addFields: {
            totalDebt: {
              $sum: "$contracts.totalPrice",
            },
            totalPaid: {
              $sum: {
                $map: {
                  input: "$payments",
                  as: "payment",
                  in: { $ifNull: ["$$payment.actualAmount", "$$payment.amount"] }, // ✅ TUZATILDI: to'g'ri format
                },
              },
            },
          },
        },
        {
          $addFields: {
            remainingDebt: {
              $subtract: ["$totalDebt", "$totalPaid"],
            },
          },
        },
        {
          $lookup: {
            from: "debtors",
            let: { contractIds: "$contracts._id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$contractId", "$$contractIds"], // ✅ TUZATILDI: $$ ishlatildi
                  },
                },
              },
              {
                $match: {
                  $or: [
                    { payment: { $exists: false } },
                    { "payment.isPaid": { $ne: true } },
                  ],
                },
              },
            ],
            as: "debtors",
          },
        },
        {
          $addFields: {
            delayDays: {
              $max: {
                $map: {
                  input: "$debtors",
                  as: "debtor",
                  in: {
                    $cond: [
                      { $lt: ["$$debtor.dueDate", new Date()] }, // ✅ TUZATILDI: $$ ishlatildi
                      {
                        $dateDiff: {
                          startDate: "$$debtor.dueDate", // ✅ TUZATILDI: $$ ishlatildi
                          endDate: new Date(),
                          unit: "day",
                        },
                      },
                      0,
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            fullName: 1,
            phoneNumber: 1,
            address: 1,
            totalDebt: 1,
            totalPaid: 1,
            remainingDebt: 1,
            delayDays: 1,
          },
        },
      ]);

      logger.debug("📊 Customer data found:", customerData.length);

      if (!customerData.length) {
        logger.debug("❌ Customer not found or not accessible");
        throw BaseError.NotFoundError(
          "Mijoz topilmadi yoki sizga tegishli emas"
        );
      }

      logger.debug("✅ Customer details:", {
        fullName: customerData[0].fullName,
        phoneNumber: customerData[0].phoneNumber,
        totalDebt: customerData[0].totalDebt,
        totalPaid: customerData[0].totalPaid,
        remainingDebt: customerData[0].remainingDebt,
      });
      logger.debug("=".repeat(50) + "\n");

      return {
        status: "success",
        data: customerData[0],
      };
    } catch (error) {
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getCustomerContracts(customerId: string) {
    logger.debug("\n🔍 === GET CUSTOMER CONTRACTS ===");
    logger.debug("👤 Customer ID:", customerId);

    const allContracts = await Contract.aggregate([
      {
        $match: {
          customer: new Types.ObjectId(customerId),
          status: { $in: ["active", "completed"] },
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
          totalDebt: "$totalPrice",
          totalPaid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$paymentDetails",
                    as: "p",
                    cond: {
                      // ✅ TUZATISH #13: Faqat to'liq to'langan to'lovlar (PENDING EMAS!)
                      $eq: ["$$p.isPaid", true]
                    },
                  },
                },
                as: "pp",
                // ✅ TUZATISH: Har doim `actualAmount` ishlatish, eski to'lovlar uchun `amount`ga qaytish
                in: { $ifNull: ["$$pp.actualAmount", "$$pp.amount"] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          remainingDebt: { $subtract: ["$totalDebt", "$totalPaid"] },
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          totalDebt: 1,
          totalPaid: 1,
          remainingDebt: 1,
          monthlyPayment: 1,
          startDate: 1,
          initialPayment: 1,
          initialPaymentDueDate: 1,
          period: 1,
          nextPaymentDate: 1,
          previousPaymentDate: 1,
          postponedAt: 1,
          isPostponedOnce: 1,
          originalPaymentDay: 1,
          durationMonths: "$period", // ✅ period -> durationMonths
          payments: {
            $map: {
              input: "$paymentDetails",
              as: "payment",
              in: {
                _id: "$$payment._id",
                amount: "$$payment.amount",
                actualAmount: "$$payment.actualAmount",
                date: "$$payment.date",
                isPaid: "$$payment.isPaid",
                paymentType: "$$payment.paymentType",
                status: "$$payment.status",
                remainingAmount: "$$payment.remainingAmount",
                excessAmount: "$$payment.excessAmount",
                expectedAmount: "$$payment.expectedAmount",
                targetMonth: "$$payment.targetMonth",
                reminderDate: "$$payment.reminderDate", // ✅ YANGI - Eslatma sanasi
              },
            },
          },
          paidMonthsCount: {
            $size: {
              $filter: {
                input: "$paymentDetails",
                as: "p",
                cond: {
                  $and: [
                    // ✅ TUZATISH #13: Faqat to'liq to'langan to'lovlar (PENDING EMAS!)
                    { $eq: ["$$p.isPaid", true] },
                    { $eq: ["$$p.paymentType", "monthly"] }
                  ],
                },
              },
            },
          },
          // ✅ YANGI: Shartnoma tugallanganligini hisoblash
          isCompleted: {
            $gte: [
              {
                $size: {
                  $filter: {
                    input: "$paymentDetails",
                    as: "p",
                    cond: {
                      $and: [
                        { $eq: ["$$p.isPaid", true] },
                        { $eq: ["$$p.paymentType", "monthly"] }
                      ],
                    },
                  },
                },
              },
              "$period"
            ]
          },
        },
      },
    ]);

    // ✅ Production uchun minimal logging
    logger.debug(`📋 Contracts found: ${allContracts.length} for customer: ${customerId}`);

    const debtorContractsRaw = await Debtor.aggregate([
      {
        $lookup: {
          from: "contracts",
          localField: "contractId",
          foreignField: "_id",
          as: "contract",
        },
      },
      { $unwind: "$contract" },
      {
        $match: {
          "contract.customer": new Types.ObjectId(customerId),
          "contract.status": "active",
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "contract.payments",
          foreignField: "_id",
          as: "paymentDetails",
        },
      },
      {
        $addFields: {
          debtorId: "$_id",
          isPaid: {
            $eq: [{ $ifNull: ["$payment.isPaid", false] }, true],
          },
          totalDebt: "$contract.totalPrice",
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
                in: { $ifNull: ["$$pp.actualAmount", "$$pp.amount"] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          remainingDebt: {
            $subtract: ["$totalDebt", "$totalPaid"],
          },
        },
      },
      {
        $project: {
          _id: "$contract._id",
          productName: "$contract.productName",
          totalDebt: 1,
          totalPaid: 1,
          remainingDebt: 1,
          monthlyPayment: "$contract.monthlyPayment",
          startDate: "$contract.startDate",
          initialPayment: "$contract.initialPayment",
          initialPaymentDueDate: "$contract.initialPaymentDueDate",
          period: "$contract.period",
          nextPaymentDate: "$contract.nextPaymentDate",
          previousPaymentDate: "$contract.previousPaymentDate",
          postponedAt: "$contract.postponedAt",
          debtorId: "$debtorId", // ✅ TUZATISH: $addFields'dan olingan debtorId
          isPaid: 1,
          paidMonthsCount: {
            $size: {
              $filter: {
                input: "$paymentDetails",
                as: "p",
                cond: {
                  $and: [
                    // ✅ TUZATISH #13: Faqat to'liq to'langan to'lovlar (PENDING EMAS!)
                    { $eq: ["$$p.isPaid", true] },
                    { $eq: ["$$p.paymentType", "monthly"] }
                  ],
                },
              },
            },
          },
          durationMonths: "$contract.period", // ✅ period -> durationMonths
          payments: {
            $map: {
              input: "$paymentDetails",
              as: "payment",
              in: {
                _id: "$$payment._id",
                amount: "$$payment.amount",
                actualAmount: "$$payment.actualAmount",
                date: "$$payment.date",
                isPaid: "$$payment.isPaid",
                paymentType: "$$payment.paymentType",
                status: "$$payment.status",
                remainingAmount: "$$payment.remainingAmount",
                excessAmount: "$$payment.excessAmount",
                expectedAmount: "$$payment.expectedAmount",
                targetMonth: "$$payment.targetMonth",
                reminderDate: "$$payment.reminderDate", // ✅ YANGI - Eslatma sanasi
              },
            },
          },
        },
      },
    ]);

    logger.debug(`📋 Debtor Contracts: ${debtorContractsRaw.length}`);

    // ✅ YANGI: Shartnomalarni tugallanganlik bo'yicha kategoriyalash
    const completedContracts = allContracts.filter((c) => c.isCompleted === true);
    const activeContracts = allContracts.filter((c) => c.isCompleted === false);

    const paidContracts = debtorContractsRaw.filter((c) => c.isPaid === true);
    const debtorContracts = debtorContractsRaw.filter(
      (c) => c.isPaid === false
    );

    logger.debug(`✅ Response: ${allContracts.length} all, ${paidContracts.length} paid, ${debtorContracts.length} debtor contracts`);

    const response = {
      status: "success",
      data: {
        allContracts: allContracts || [],
        paidContracts: paidContracts || [],
        debtorContracts: debtorContracts || [],
      },
    };

    return response;
  }
}

export default new CustomerService();