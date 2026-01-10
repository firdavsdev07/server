/**
 * Contract Query Service - Handles all database queries and aggregations
 * 
 * Responsibilities:
 * - Get all active contracts
 * - Get all new contracts (not approved)
 * - Get all completed contracts
 * - Get contract by ID with full details
 * 
 * This service is read-only - no mutations
 */

import Contract, { ContractStatus } from "../../../schemas/contract.schema";
import { Types } from "mongoose";

export class ContractQueryService {
  /**
   * Get all active contracts with aggregated data
   * Returns: contracts with customer info, payments, and calculated totals
   */
  async getAll() {
    return await Contract.aggregate([
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
                fullName: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "payments",
          foreignField: "_id",
          as: "payments",
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
          totalPaid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payments",
                    as: "p",
                    cond: { $eq: ["$$p.isPaid", true] }
                  },
                },
                as: "pp",
                // ✅ TUZATISH: Har doim to'langan summa uchun `actualAmount`ni ishlatish.
                // `actualAmount` mavjud bo'lmagan eski ma'lumotlar uchun `amount`ga qaytish.
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
      {
        $project: {
          _id: 1,
          contractId: 1,
          productName: 1,
          originalPrice: 1,
          price: 1,
          totalPrice: 1,
          initialPayment: 1,
          initialPaymentDueDate: 1,
          monthlyPayment: 1,
          percentage: 1,
          period: 1,
          startDate: 1,
          nextPaymentDate: 1,
          originalPaymentDay: 1,  // ✅ originalPaymentDay qo'shildi
          status: 1,
          customer: 1,
          customerName: 1,
          notes: 1,
          payments: 1,
          totalPaid: 1,
          remainingDebt: 1,
          info: 1,
          createdAt: 1,
          updatedAt: 1,
          isActive: 1,
          isDeleted: 1,
          prepaidBalance: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
  }

  /**
   * Get all new (not approved) contracts
   * Returns: contracts with customer, seller, and manager info
   */
  async getAllNewContract() {
    return await Contract.aggregate([
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
                fullName: 1,
                percent: 1,
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
        $lookup: {
          from: "employees",
          localField: "createBy",
          foreignField: "_id",
          as: "seller",
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
          customerName: {
            $concat: [
              "$customer.fullName",
            ],
          },
          sellerName: {
            $cond: [
              { $gt: [{ $size: "$seller" }, 0] },
              {
                $concat: [
                  { $arrayElemAt: ["$seller.firstName", 0] },
                  " ",
                  {
                    $ifNull: [{ $arrayElemAt: ["$seller.lastName", 0] }, ""],
                  },
                ],
              },
              "N/A",
            ],
          },
          notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, null] },
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          originalPrice: 1,
          price: 1,
          totalPrice: 1,
          initialPayment: 1,
          initialPaymentDueDate: 1,
          monthlyPayment: 1,
          percentage: 1,
          period: 1,
          startDate: 1,
          nextPaymentDate: 1,
          originalPaymentDay: 1,  // ✅ originalPaymentDay qo'shildi
          status: 1,
          customer: 1,
          customerName: 1,
          sellerName: 1,
          notes: 1,
          info: 1,
          createdAt: 1,
          updatedAt: 1,
          isActive: 1,
          isDeleted: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
  }

  /**
   * Get all completed contracts
   * Returns: completed contracts with customer info and calculated totals
   */
  async getAllCompleted() {
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
                fullName: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "payments",
          foreignField: "_id",
          as: "payments",
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
          totalPaid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payments",
                    as: "p",
                    cond: { $eq: ["$$p.isPaid", true] }
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
      {
        $project: {
          _id: 1,
          contractId: 1,
          productName: 1,
          originalPrice: 1,
          price: 1,
          totalPrice: 1,
          initialPayment: 1,
          initialPaymentDueDate: 1,
          monthlyPayment: 1,
          percentage: 1,
          period: 1,
          startDate: 1,
          nextPaymentDate: 1,
          originalPaymentDay: 1,  // ✅ originalPaymentDay qo'shildi
          status: 1,
          customer: 1,
          customerName: 1,
          notes: 1,
          payments: 1,
          totalPaid: 1,
          remainingDebt: 1,
          info: 1,
          createdAt: 1,
          updatedAt: 1,
          isActive: 1,
          isDeleted: 1,
          prepaidBalance: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
  }

  /**
   * Get contract by ID with full details
   * Returns: contract with customer, manager, payments, notes, and edit history
   */
  async getContractById(contractId: string) {
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
            { $unwind: "$manager" },
            {
              $project: {
                fullName: 1,
                percent: 1,
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
            {
              $project: {
                _id: 1,
                paymentId: 1,
                amount: 1,
                actualAmount: 1,
                date: 1,
                isPaid: 1,
                paymentType: 1,
                status: 1,
                remainingAmount: 1,
                excessAmount: 1,
                expectedAmount: 1,
                prepaidAmount: 1,
                notes: 1,
                confirmedAt: 1,
                confirmedBy: 1,
                targetMonth: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          totalPaid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payments",
                    as: "p",
                    cond: { $eq: ["$$p.isPaid", true] }
                  },
                },
                as: "pp",
                // ✅ TUZATISH: Har doim to'langan summa uchun `actualAmount`ni ishlatish.
                // `actualAmount` mavjud bo'lmagan eski ma'lumotlar uchun `amount`ga qaytish.
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
      // Populate editHistory.editedBy
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
      {
        $project: {
          _id: 1,
          contractId: 1,
          productName: 1,
          originalPrice: 1,
          price: 1,
          totalPrice: 1,
          initialPayment: 1,
          initialPaymentDueDate: 1,
          monthlyPayment: 1,
          percentage: 1,
          period: 1,
          duration: 1,
          startDate: 1,
          endDate: 1,
          nextPaymentDate: 1,
          originalPaymentDay: 1,  // ✅ originalPaymentDay qo'shildi
          status: 1,
          customer: 1,
          notes: 1,
          payments: 1,
          totalPaid: 1,
          remainingDebt: 1,
          info: 1,
          editHistory: 1,
          createdAt: 1,
          updatedAt: 1,
          prepaidBalance: 1,
        },
      },
    ]);
    return contract[0];
  }
}

export default new ContractQueryService();
