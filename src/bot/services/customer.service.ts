import Contract from "../../schemas/contract.schema";
import Customer from "../../schemas/customer.schema";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

import { Debtor } from "../../schemas/debtor.schema";
import Reminder from "../../schemas/reminder.schema";
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
    }).select("firstName lastName _id phoneNumber");

    logger.debug(`✅ Found ${customers.length} customers for manager`);

    if (customers.length > 0) {
      logger.debug("📋 Sample customer:", {
        firstName: customers[0].firstName,
        lastName: customers[0].lastName,
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
      logger.debug("👤 Manager ID:", user.sub);
      logger.debug("📅 Original filterDate param:", filterDate || "not provided");

      // ✅ YANGI LOGIKA: Agar filterDate berilmagan bo'lsa, barcha qarzdorlarni qaytarish
      const isShowAll = !filterDate;

      let matchCondition: any = {
        isActive: true,
        isDeleted: false,
        status: "active",
      };

      // ✅ Bugungi sana (kechikkan to'lovlar uchun)
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (!isShowAll && filterDate) {
        // ✅ YANGI: Tanlangan sana (masalan, 20-dekabr) - 1-dekabrdan 20-dekabrgacha filterlash
        const selectedDate = new Date(filterDate + 'T00:00:00.000Z'); // ✅ UTC format
        
        // Oy boshini hisoblash (masalan, 2025-12-01)
        const monthStart = new Date(selectedDate);
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        
        // Tanlangan sanani (masalan, 2025-12-20 23:59:59)
        const monthEnd = new Date(selectedDate);
        monthEnd.setUTCHours(23, 59, 59, 999);

        logger.debug("📅 Filter by DATE RANGE (month start to selected date):", {
          monthStart: monthStart.toISOString(),
          monthEnd: monthEnd.toISOString(),
          originalDate: filterDate,
          filterType: "date_range_current_month"
        });

        // ✅ nextPaymentDate oyning 1-kunidan tanlangan kungacha bo'lishi kerak
        matchCondition.nextPaymentDate = { 
          $gte: monthStart, // ≥ oy boshi
          $lte: monthEnd     // ≤ tanlangan sana
        };
      } else {
        // ✅ Barcha kechikkan to'lovlar (filterDate yo'q bo'lsa)
        matchCondition.nextPaymentDate = { $lte: today };
      }

      logger.debug("🔍 Match condition:", JSON.stringify(matchCondition, null, 2));

      // Debug: Barcha shartnomalarni sanash
      const totalContracts = await Contract.countDocuments({
        isActive: true,
        isDeleted: false,
        status: "active",
      });
      logger.debug("📊 Total active contracts:", totalContracts);

      // To'g'ridan-to'g'ri Contract'lardan kechikkan to'lovlarni olish
      const result = await Contract.aggregate([
        {
          $match: matchCondition,
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
          $match: {
            "customer.manager": new Types.ObjectId(user.sub),
            "customer.isActive": true,
            "customer.isDeleted": false,
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
                  in: { $ifNull: ["$$pp.actualAmount", "$$pp.amount"] },
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
        // Faqat qarzi bor shartnomalar
        {
          $match: {
            remainingDebt: { $gt: 0 },
          },
        },
        // Kechikish kunlarini hisoblash (MongoDB 4.x uchun ham ishlaydi)
        {
          $addFields: {
            delayDays: {
              $floor: {
                $divide: [
                  { $subtract: [new Date(), "$nextPaymentDate"] },
                  1000 * 60 * 60 * 24, // milliseconds to days
                ],
              },
            },
          },
        },
        {
          $group: {
            _id: "$customer._id",
            firstName: { $first: "$customer.firstName" },
            lastName: { $first: "$customer.lastName" },
            phoneNumber: { $first: "$customer.phoneNumber" },
            delayDays: { $max: "$delayDays" },
            totalDebt: { $sum: "$remainingDebt" },
            contractsCount: { $sum: 1 },
            maxNextPaymentDate: { $max: "$nextPaymentDate" }, // ✅ Eng katta nextPaymentDate
          },
        },
        // ✅ YANGI SORTING: Agar filterDate berilgan bo'lsa, nextPaymentDate bo'yicha kamayib borish (20→1)
        // Aks holda, kechikish kunlari bo'yicha kamayib borish
        { 
          $sort: isShowAll 
            ? { delayDays: -1 } // Barcha qarzdorlar - kechikish bo'yicha
            : { maxNextPaymentDate: -1 } // Filterlangan - sana bo'yicha (20→19→...→1)
        },
      ]);

      logger.debug(`✅ Found ${result.length} customers with overdue payments`);

      if (result.length > 0) {
        logger.debug("📋 Sample debtor:", {
          firstName: result[0].firstName,
          lastName: result[0].lastName,
          delayDays: result[0].delayDays,
          totalDebt: result[0].totalDebt,
          contractsCount: result[0].contractsCount,
        });
      }
      logger.debug("=".repeat(50) + "\n");

      return {
        status: "success",
        data: result,
      };
    } catch (error) {
      logger.error("❌ Error getting unpaid debtors:", error);
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getPaidDebtors(user: IJwtUser) {
    try {
      logger.debug("\n💰 === GETTING CUSTOMERS WITH PAYMENTS ===");
      logger.debug("👤 Manager ID:", user.sub);

      // Oxirgi 30 kun ichida to'lov qilgan mijozlarni olish
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      logger.debug("📅 Looking for payments since:", thirtyDaysAgo.toISOString().split("T")[0]);

      // Payment collection'dan to'lov qilgan mijozlarni topish
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
            as: "customer",
          },
        },
        { $unwind: "$customer" },
        {
          $match: {
            "customer.manager": new Types.ObjectId(user.sub),
            "customer.isActive": true,
            "customer.isDeleted": false,
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
        // Faqat oxirgi 30 kun ichida to'lov qilgan shartnomalar
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
            "recentPayments.0": { $exists: true }, // Kamida 1 ta to'lov bo'lishi kerak
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
              $max: {
                $map: {
                  input: "$recentPayments",
                  as: "p",
                  in: "$$p.date",
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
        // Mijozlar bo'yicha guruhlash
        {
          $group: {
            _id: "$customer._id",
            firstName: { $first: "$customer.firstName" },
            lastName: { $first: "$customer.lastName" },
            phoneNumber: { $first: "$customer.phoneNumber" },
            lastPaymentDate: { $max: "$lastPaymentDate" },
            totalPaid: { $sum: "$totalPaid" },
            totalDebt: { $sum: "$totalPrice" },
            remainingDebt: { $sum: "$remainingDebt" },
            contractsCount: { $sum: 1 },
          },
        },
        { $sort: { lastPaymentDate: -1 } }, // Eng oxirgi to'lov qilganlar birinchi
      ]);

      logger.debug(`✅ Found ${result.length} customers with recent payments`);

      if (result.length > 0) {
        logger.debug("📋 Sample customer:", {
          firstName: result[0].firstName,
          lastName: result[0].lastName,
          lastPaymentDate: result[0].lastPaymentDate,
          totalPaid: result[0].totalPaid,
          remainingDebt: result[0].remainingDebt,
        });
      }
      logger.debug("=".repeat(50) + "\n");

      return {
        status: "success",
        data: result,
      };
    } catch (error) {
      logger.error("❌ Error getting customers with payments:", error);
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
            firstName: 1,
            lastName: 1,
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
        firstName: customerData[0].firstName,
        lastName: customerData[0].lastName,
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
          reminderDate: 1, // ✅ YANGI: Eslatma sanasi
          reminders: 1, // ✅ YANGI: Reminder array
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
                reminderDate: "$$payment.reminderDate", // ✅ YANGI: Payment uchun reminder
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

    logger.debug("📋 All Contracts COUNT:", allContracts.length);

    if (allContracts.length > 0) {
      const firstContract = allContracts[0];
      const pendingPayments = firstContract.payments?.filter((p: any) => p.status === 'PENDING') || [];
      
      logger.debug("📋 First Contract Details:", {
        _id: firstContract._id,
        productName: firstContract.productName,
        totalPayments: firstContract.payments?.length || 0,
        pendingPaymentsCount: pendingPayments.length,
        pendingPayments: pendingPayments.map((p: any) => ({
          _id: p._id,
          targetMonth: p.targetMonth,
          status: p.status,
          isPaid: p.isPaid,
        })),
        initialPaymentDueDate: allContracts[0].initialPaymentDueDate,
        monthlyPayment: allContracts[0].monthlyPayment,
        period: allContracts[0].period,
        paidMonthsCount: allContracts[0].paidMonthsCount,
        durationMonths: allContracts[0].durationMonths,
        totalDebt: allContracts[0].totalDebt,
        totalPaid: allContracts[0].totalPaid,
        remainingDebt: allContracts[0].remainingDebt,
        paymentsCount: allContracts[0].payments?.length || 0,
        paymentsIsNull: allContracts[0].payments === null,
        paymentsIsUndefined: allContracts[0].payments === undefined,
      });

      logger.debug("📋 Payments Array:", allContracts[0].payments?.map((p: any) => ({
        _id: p._id,
        paymentType: p.paymentType,
        isPaid: p.isPaid,
        status: p.status,
        amount: p.amount,
        targetMonth: p.targetMonth,
        date: p.date,
      })));
    }

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
          reminderDate: "$contract.reminderDate", // ✅ YANGI: Eslatma sanasi
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
                reminderDate: "$$payment.reminderDate", // ✅ YANGI: Payment uchun reminder
              },
            },
          },
        },
      },
    ]);

    logger.debug("📋 Debtor Contracts:", debtorContractsRaw.map(c => ({
      _id: c._id,
      productName: c.productName,
      paidMonthsCount: c.paidMonthsCount,
      durationMonths: c.durationMonths,
      paymentsCount: c.payments?.length || 0,
      payments: c.payments?.map((p: any) => ({
        paymentType: p.type, // Make sure this is correct
        isPaid: p.isPaid,
        amount: p.amount,
      })),
    })));

    // ✅ YANGI: Shartnomalarni tugallanganlik bo'yicha kategoriyalash
    const completedContracts = allContracts.filter((c) => c.isCompleted === true);
    const activeContracts = allContracts.filter((c) => c.isCompleted === false);
    
    const paidContracts = debtorContractsRaw.filter((c) => c.isPaid === true);
    const debtorContracts = debtorContractsRaw.filter(
      (c) => c.isPaid === false
    );

    logger.debug("✅ FINAL RESPONSE:", {
      allContractsCount: allContracts.length,
      activeContractsCount: activeContracts.length,
      completedContractsCount: completedContracts.length,
      paidContractsCount: paidContracts.length,
      debtorContractsCount: debtorContracts.length,
    });

    // ✅ TUZATISH: allContracts -> activeContracts, completedContracts -> paidContracts
    const response = {
      status: "success",
      data: {
        allContracts: activeContracts || [], // ✅ Faqat faol shartnomalar
        paidContracts: completedContracts || [], // ✅ Tugallangan shartnomalar
        debtorContracts: debtorContracts || [],
      },
    };

    logger.debug("📤 SENDING RESPONSE:", {
      hasActiveContracts: !!response.data.allContracts,
      activeContractsLength: response.data.allContracts.length,
      hasCompletedContracts: !!response.data.paidContracts,
      completedContractsLength: response.data.paidContracts.length,
      firstActiveContract: response.data.allContracts[0] ? {
        _id: response.data.allContracts[0]._id,
        paidMonthsCount: response.data.allContracts[0].paidMonthsCount,
        durationMonths: response.data.allContracts[0].durationMonths,
        isCompleted: response.data.allContracts[0].isCompleted,
        paymentsCount: response.data.allContracts[0].payments?.length,
      } : null,
      firstCompletedContract: response.data.paidContracts[0] ? {
        _id: response.data.paidContracts[0]._id,
        paidMonthsCount: response.data.paidContracts[0].paidMonthsCount,
        durationMonths: response.data.paidContracts[0].durationMonths,
        isCompleted: response.data.paidContracts[0].isCompleted,
      } : null,
    });

    return response;
  }
}

export default new CustomerService();