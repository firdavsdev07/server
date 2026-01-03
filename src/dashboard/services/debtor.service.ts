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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

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
            contractTotalPaid: {
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
            delayDays: {
              $max: [
                0,
                {
                  $dateDiff: {
                    startDate: "$nextPaymentDate",
                    endDate: today,
                    unit: "day",
                  },
                },
              ],
            },
          },
        },
        {
          $addFields: {
            contractRemainingDebt: {
              $subtract: ["$totalPrice", "$contractTotalPaid"],
            },
          },
        },
        {
          $addFields: {
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
          $group: {
            _id: "$customer._id",
            fullName: { $first: "$customer.fullName" },
            phoneNumber: { $first: "$customer.phoneNumber" },
            managerFirstName: { $first: "$manager.firstName" },
            managerLastName: { $first: "$manager.lastName" },
            activeContractsCount: { $sum: 1 },
            totalPrice: { $sum: "$totalPrice" },
            totalPaid: { $sum: "$contractTotalPaid" },
            remainingDebt: { $sum: "$contractRemainingDebt" },
            nextPaymentDate: { $min: "$nextPaymentDate" },
            createdAt: { $first: "$createdAt" },
            // Shartnomalar ro'yxati (har birining kechikkan kuni bilan)
            contracts: {
              $push: {
                _id: "$_id",
                productName: "$productName",
                totalPrice: "$totalPrice",
                totalPaid: "$contractTotalPaid",
                remainingDebt: "$contractRemainingDebt",
                period: "$period",
                monthlyPayment: "$monthlyPayment",
                initialPayment: "$initialPayment",
                startDate: "$startDate",
                nextPaymentDate: "$nextPaymentDate",
                delayDays: "$delayDays", // ✅ Har bir shartnomaning alohida kechikkan kuni
                paidMonthsCount: "$paidMonthsCount",
              },
            },
            // ✅ YANGI: Barcha shartnomalarning kechikkan kunlari (noyob qiymatlar)
            allDelayDays: { $addToSet: "$delayDays" },
          },
        },
        {
          $project: {
            _id: 1,
            fullName: "$fullName",
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
            contracts: 1,
            createdAt: 1,
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
            fullName: "$customer.fullName",
            phoneNumber: "$customer.phoneNumber",
            manager: { $concat: [{ $ifNull: ["$manager.firstName", ""] }, " ", { $ifNull: ["$manager.lastName", ""] }] },
            totalPrice: 1,
            totalPaid: 1,
            remainingDebt: 1,
            nextPaymentDate: 1,
            productName: 1,
            startDate: 1,
            delayDays: 1,
            initialPayment: 1,
            monthlyPayment: 1,
            period: 1,
            paidMonthsCount: 1,
            createdAt: 1
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
   * ✅ YANGI: Contract-based approach - har bir contract uchun barcha kechikkan to'lovlarni tekshirish
   */
  async createOverdueDebtors() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      logger.info("🔍 === CREATING OVERDUE DEBTORS ===");
      logger.info(`Today: ${today.toISOString()}`);
      
      // ✅ Contract-based: Barcha active shartnomalarni olish
      const contracts = await Contract.find({
        isActive: true,
        isDeleted: false,
        isDeclare: false,
        status: ContractStatus.ACTIVE,
      }).populate('payments');
      
      logger.info(`📊 Checking ${contracts.length} active contract(s)`);
      
      let createdCount = 0;
      let skippedCount = 0;
      let overduePaymentsCount = 0;
      
      for (const contract of contracts) {
        const payments = contract.payments as any[];
        
        // ✅ Har bir contract uchun kechikkan to'lovlarni topish
        const overduePayments = payments.filter(p => 
          !p.isPaid && 
          p.paymentType === PaymentType.MONTHLY && 
          new Date(p.date) < today
        );
        
        if (overduePayments.length === 0) {
          continue;
        }
        
        overduePaymentsCount += overduePayments.length;
        
        // ✅ Har bir kechikkan to'lov uchun alohida debtor yaratish
        for (const payment of overduePayments) {
          const paymentDate = new Date(payment.date);
          
          // Debtor allaqachon mavjudmi? (dueDate bo'yicha)
          const existingDebtor = await Debtor.findOne({ 
            contractId: contract._id,
            dueDate: paymentDate
          });
          
          if (!existingDebtor) {
            const overdueDays = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
            
            await Debtor.create({
              contractId: contract._id,
              debtAmount: payment.amount,
              dueDate: paymentDate,
              overdueDays: Math.max(0, overdueDays),
              createBy: contract.createBy,
            });
            
            createdCount++;
            logger.debug(`✅ Debtor created: Contract ${contract._id}, Due: ${paymentDate.toISOString().split('T')[0]}, Overdue: ${overdueDays} days`);
          } else {
            // ✅ Mavjud debtor'ni yangilash (overdueDays)
            const overdueDays = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
            existingDebtor.overdueDays = Math.max(0, overdueDays);
            await existingDebtor.save();
            skippedCount++;
          }
        }
      }
      
      logger.info(`✅ Debtor creation completed: Found ${overduePaymentsCount} overdue payment(s), Created ${createdCount}, Updated ${skippedCount}`);
      
      return { 
        created: createdCount,
        updated: skippedCount,
        totalOverduePayments: overduePaymentsCount
      };
    } catch (error) {
      logger.error("❌ Error creating overdue debtors:", error);
      throw BaseError.InternalServerError("Qarzdorlar yaratishda xatolik");
    }
  }
}

export default new DebtorService();
