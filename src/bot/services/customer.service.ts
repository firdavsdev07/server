import Contract from "../../schemas/contract.schema";
import Customer from "../../schemas/customer.schema";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

import { Debtor } from "../../schemas/debtor.schema";
import BaseError from "../../utils/base.error";
import { Types } from "mongoose";

class CustomerService {
  async getAll(user: IJwtUser) {

    const totalCustomers = await Customer.countDocuments({
      isActive: true,
      isDeleted: false,
    });

    const managerCustomers = await Customer.countDocuments({
      isActive: true,
      isDeleted: false,
      manager: user.sub,
    });

    const customers = await Customer.find({
      isActive: true,
      isDeleted: false,
      manager: user.sub,
    }).select("customerId fullName _id phoneNumber");


    if (customers.length > 0) {
      logger.debug("Sample customer:", {
        fullName: customers[0].fullName,
        phoneNumber: customers[0].phoneNumber,
      });
    }

    return {
      status: "success",
      data: customers,
    };
  }

  async getUnpaidDebtors(user: IJwtUser, filterDate?: string) {
    try {
      let filterEndDate: Date;

      if (filterDate && filterDate.trim() !== "") {
        const [year, month, day] = filterDate.split('-').map(Number);
        filterEndDate = new Date(year, month - 1, day, 23, 59, 59, 999);
      } else {
        // Default: bugungi kun
        filterEndDate = new Date();
        filterEndDate.setHours(23, 59, 59, 999);
      }

      const managerId = new Types.ObjectId(user.sub);
      const currentDate = new Date(); // Hozirgi sana (reminderDate uchun)

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
        { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: false } },

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
          $match: {
            nextPaymentDate: {
              $exists: true,
              $ne: null,
              $lte: filterEndDate
            }
          }
        },

        // ✅ YANGI: Eslatma tekshirish - faqat reminderDate o'tgan yoki null bo'lgan to'lovlarni olish
        {
          $addFields: {
            // Barcha to'lanmagan to'lovlarni olish
            unpaidPayments: {
              $filter: {
                input: "$paymentDetails",
                as: "p",
                cond: { $eq: ["$$p.isPaid", false] }
              }
            }
          }
        },
        {
          $addFields: {
            // nextPaymentDate'ga mos payment'ni topish
            // Sana taqqoslash muammosi bo'lsa - date range bilan
            nextPaymentData: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$unpaidPayments",
                    as: "p",
                    cond: {
                      $and: [
                        // Date'larni string formatda taqqoslash
                        {
                          $eq: [
                            { $dateToString: { format: "%Y-%m-%d", date: "$$p.date" } },
                            { $dateToString: { format: "%Y-%m-%d", date: "$nextPaymentDate" } }
                          ]
                        },
                        { $eq: ["$$p.paymentType", "monthly"] }
                      ]
                    }
                  }
                },
                0
              ]
            }
          }
        },

        // ✅ Agar reminderDate bor va hali o'tmagan bo'lsa - bu shartnomani filtrlash
        {
          $match: {
            $or: [
              // reminderDate yo'q
              { "nextPaymentData.reminderDate": { $exists: false } },
              { "nextPaymentData.reminderDate": null },
              // yoki reminderDate o'tgan (bugundan kichik yoki teng)
              { "nextPaymentData.reminderDate": { $lte: currentDate } }
            ]
          }
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
            paidMonthsCount: {
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
          },
        },

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

        {
          $match: { remainingDebt: { $gt: 0 } }
        },

        {
          $project: {
            _id: "$_id", // Contract ID
            customerId: "$customerData._id",
            fullName: "$customerData.fullName",
            phoneNumber: "$customerData.phoneNumber",
            productName: "$productName",
            contractId: "$_id",
            remainingDebt: "$remainingDebt",
            delayDays: "$delayDays",
            nextPaymentDate: "$nextPaymentDate",
            totalPrice: { $ifNull: ["$totalPrice", "$price"] },
            totalPaid: "$totalPaid",
            startDate: "$startDate",
            originalPaymentDay: "$originalPaymentDay",
            period: "$period",
            paidMonthsCount: "$paidMonthsCount",
            isPending: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$paymentDetails",
                      as: "p",
                      cond: {
                        $and: [
                          { $eq: ["$$p.status", "PENDING"] },
                          { $eq: ["$$p.isPaid", false] }
                        ]
                      }
                    }
                  }
                },
                0
              ]
            }
          },
        },

        { $sort: { delayDays: -1, remainingDebt: -1 } },
      ]);


      if (result.length > 0) {
        logger.debug(`✅ Qarzdorlar ro'yxati (reminderDate filtr bilan):`, {
          count: result.length,
          sample: {
            name: result[0].fullName,
            remainingDebt: result[0].remainingDebt,
            delayDays: result[0].delayDays,
            nextPaymentDate: result[0].nextPaymentDate
          }
        });
      } else {
        logger.debug(`✅ Qarzdorlar topilmadi (hamma eslatma qo'ygan bo'lishi mumkin)`);
      }

      return { status: "success", data: result };
    } catch (error) {
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getPaidDebtors(user: IJwtUser) {
    try {

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
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getById(user: IJwtUser, customerId: string) {
    try {


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
            let: { customerId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$customer", "$$customerId"] },
                      { $eq: ["$isDeleted", false] },
                      { $eq: ["$isActive", true] }
                    ]
                  }
                }
              }
            ],
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
                      { $eq: ["$customerId", "$$customerId"] },
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
                    $in: ["$contractId", "$$contractIds"],
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
                      { $lt: ["$$debtor.dueDate", new Date()] },
                      {
                        $dateDiff: {
                          startDate: "$$debtor.dueDate",
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


      if (!customerData.length) {
        throw BaseError.NotFoundError(
          "Mijoz topilmadi yoki sizga tegishli emas"
        );
      }



      return {
        status: "success",
        data: customerData[0],
      };
    } catch (error) {
      throw BaseError.InternalServerError(String(error));
    }
  }

  async getCustomerContracts(customerId: string) {


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
                      $eq: ["$$p.isPaid", true]
                    },
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
          durationMonths: "$period",
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
                reminderDate: "$$payment.reminderDate",
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
                    { $eq: ["$$p.isPaid", true] },
                    { $eq: ["$$p.paymentType", "monthly"] }
                  ],
                },
              },
            },
          },
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


    const debtorContractsRaw = await Debtor.aggregate([
      {
        $lookup: {
          from: "contracts",
          let: { contractId: "$contractId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$contractId"] },
                    { $eq: ["$isDeleted", false] },
                    { $eq: ["$isActive", true] }
                  ]
                }
              }
            }
          ],
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
          debtorId: "$debtorId",
          isPaid: 1,
          paidMonthsCount: {
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
          durationMonths: "$contract.period",
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
                reminderDate: "$$payment.reminderDate",
              },
            },
          },
        },
      },
    ]);

    const completedContracts = allContracts.filter((c) => c.isCompleted === true);
    const activeContracts = allContracts.filter((c) => c.isCompleted === false);

    const paidContracts = debtorContractsRaw.filter((c) => c.isPaid === true);
    const debtorContracts = debtorContractsRaw.filter(
      (c) => c.isPaid === false
    );


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