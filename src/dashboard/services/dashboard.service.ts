import Employee from "../../schemas/employee.schema";
import { Debtor } from "../../schemas/debtor.schema";
import { Balance } from "../../schemas/balance.schema";
import Customer from "../../schemas/customer.schema";
import Contract from "../../schemas/contract.schema";
import Payment from "../../schemas/payment.schema";
import dayjs from "dayjs";
import Currency from "../../schemas/currency.schema";
import logger from "../../utils/logger";

class DashboardService {
  private cache: any = null;
  private cacheTime: number = 0;
  private CACHE_DURATION = 30000; // 30 soniya

  async dashboard() {
    // Cache tekshirish
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.CACHE_DURATION) {
      return this.cache;
    }
    const [employeeCount, customerCount, contractCount, debtorCount] =
      await Promise.all([
        Employee.countDocuments(),
        Customer.countDocuments(),
        Contract.countDocuments(),
        Debtor.countDocuments(),
      ]);

    // Valyuta kursini olish
    const currencyCourse = await Currency.findOne().sort({ createdAt: -1 });
    const exchangeRate = currencyCourse?.amount;
    const hasCurrencyRate = !!exchangeRate && exchangeRate > 0;

    const [totalBalance] = await Balance.aggregate([
      {
        $group: {
          _id: null,
          dollar: { $sum: { $ifNull: ["$dollar", 0] } },
          sum: { $sum: { $ifNull: ["$sum", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          dollar: 1,
          sum: 1,
        },
      },
    ]);

    const defaultBalance = {
      dollar: 0,
      sum: 0,
    };

    // Balans (so'm) ni hisoblash: Balans ($) * dollar kursi
    const calculatedBalance = totalBalance || defaultBalance;
    const balanceInSum = hasCurrencyRate
      ? Math.round(calculatedBalance.dollar * exchangeRate!)
      : 0; // Agar kurs yo'q bo'lsa 0

    const [initialPaymentData] = await Contract.aggregate([
      {
        $group: {
          _id: null,
          totalInitialPayment: { $sum: { $ifNull: ["$initialPayment", 0] } },
        },
      },
      { $project: { _id: 0, totalInitialPayment: 1 } },
    ]);

    // 2. To'langan summa yig'indisi (faqat to'langanlar)
    const [paidAmountData] = await Payment.aggregate([
      { $match: { isPaid: true } },
      {
        $group: {
          _id: null,
          totalPaidAmount: { $sum: "$amount" },
        },
      },
      { $project: { _id: 0, totalPaidAmount: 1 } },
    ]);

    // 3. Total contract prices
    const [contractTotalPriceData] = await Contract.aggregate([
      {
        $group: {
          _id: null,
          totalContractPrice: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
      { $project: { _id: 0, totalContractPrice: 1 } },
    ]);

    const initialPayment = initialPaymentData?.totalInitialPayment || 0;
    const paidAmount = paidAmountData?.totalPaidAmount || 0;
    const totalContractPrice = contractTotalPriceData?.totalContractPrice || 0;

    const remainingDebt = totalContractPrice - paidAmount;

    const result = {
      status: "success",
      data: {
        employees: employeeCount,
        customers: customerCount,
        contracts: contractCount,
        debtors: debtorCount,
        totalBalance: {
          dollar: calculatedBalance.dollar,
          sum: balanceInSum, // 0 yoki hisoblangan so'm miqdori
          hasCurrencyRate, // Kurs mavjudligini bildiradi
          currencyRate: exchangeRate || null,
        },
        financial: {
          totalContractPrice,
          initialPayment,
          paidAmount,
          remainingDebt,
        },
      },
    };

    // Cache'ga saqlash
    this.cache = result;
    this.cacheTime = Date.now();

    return result;
  }

  // async statistic() {
  //   const now = new Date();
  //   const startDate = dayjs(now)
  //     .subtract(11, "month")
  //     .startOf("month")
  //     .toDate();

  //   const payments = await Payment.aggregate([
  //     {
  //       $match: {
  //         isPaid: true,
  //         date: { $gte: startDate },
  //       },
  //     },
  //     {
  //       $group: {
  //         _id: {
  //           year: { $year: "$date" },
  //           month: { $month: "$date" },
  //         },
  //         totalAmount: { $sum: "$amount" },
  //       },
  //     },
  //     {
  //       $sort: {
  //         "_id.year": 1,
  //         "_id.month": 1,
  //       },
  //     },
  //   ]);

  //   // Hozirgi oyning (monthIndex: 0 - Jan, 11 - Dec) nomlarini olish
  //   const monthNames = [
  //     "Jan",
  //     "Feb",
  //     "Mar",
  //     "Apr",
  //     "May",
  //     "Jun",
  //     "Jul",
  //     "Aug",
  //     "Sep",
  //     "Oct",
  //     "Nov",
  //     "Dec",
  //   ];

  //   const resultMap = new Map<string, number>();
  //   const current = dayjs();

  //   // 12 oy bo‘yicha boshlang‘ich 0 qiymatlar bilan map yasash
  //   for (let i = 11; i >= 0; i--) {
  //     const date = current.subtract(i, "month");
  //     const key = `${date.year()}-${date.month() + 1}`; // month is 0-based
  //     const label = monthNames[date.month()];
  //     resultMap.set(key, 0);
  //   }

  //   // Aggregation natijalarini mapga joylash
  //   for (const item of payments) {
  //     const key = `${item._id.year}-${item._id.month}`;
  //     if (resultMap.has(key)) {
  //       resultMap.set(key, item.totalAmount);
  //     }
  //   }

  //   // Final arraylar
  //   const categories: string[] = [];
  //   const data: number[] = [];

  //   for (const [key, amount] of resultMap) {
  //     const [, monthStr] = key.split("-");
  //     const monthIndex = parseInt(monthStr) - 1;
  //     categories.push(monthNames[monthIndex]);
  //     data.push(amount);
  //   }

  //   return {
  //     categories,
  //     series: [...data],
  //   };
  // }
  async statistic(range: string) {
    const now = new Date();
    let startDate: Date;
    let groupBy: any;
    const formatLabel = (item: any) => "";

    if (range === "daily") {
      // Oxirgi 30 kun
      startDate = dayjs(now).subtract(29, "day").startOf("day").toDate();
      groupBy = {
        year: { $year: "$date" },
        month: { $month: "$date" },
        day: { $dayOfMonth: "$date" },
      };
    } else if (range === "yearly") {
      // Oxirgi 5 yil
      startDate = dayjs(now).subtract(4, "year").startOf("year").toDate();
      groupBy = {
        year: { $year: "$date" },
      };
    } else {
      // default: monthly
      startDate = dayjs(now).subtract(11, "month").startOf("month").toDate();
      groupBy = {
        year: { $year: "$date" },
        month: { $month: "$date" },
      };
    }

    // 1. Payment collection'dan to'lovlarni olish
    const directPayments = await Payment.aggregate([
      {
        $match: {
          isPaid: true,
          date: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: range === "daily" ? { $dayOfMonth: "$date" } : undefined,
          },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    // 2. ❌ Debtor collection'dan to'lovlarni olish kerak emas
    // Barcha to'lovlar allaqachon Payment collection'da

    // 3. Barcha to'lovlar faqat Payment collection'dan
    const allPayments = [...directPayments];

    // 4. Bir xil sana bo'yicha to'lovlarni jamlash
    const paymentMap = new Map<string, number>();

    for (const payment of allPayments) {
      const key =
        range === "daily"
          ? `${payment._id.year}-${payment._id.month}-${payment._id.day}`
          : range === "yearly"
          ? `${payment._id.year}`
          : `${payment._id.year}-${payment._id.month}`;

      const currentAmount = paymentMap.get(key) || 0;
      paymentMap.set(key, currentAmount + payment.totalAmount);
    }

    // 5. Map'ni array'ga aylantirish
    const payments = Array.from(paymentMap.entries())
      .map(([key, totalAmount]) => {
        if (range === "daily") {
          const [year, month, day] = key.split("-").map(Number);
          return { _id: { year, month, day }, totalAmount };
        } else if (range === "yearly") {
          return { _id: { year: Number(key) }, totalAmount };
        } else {
          const [year, month] = key.split("-").map(Number);
          return { _id: { year, month }, totalAmount };
        }
      })
      .sort((a, b) => {
        if (range === "daily") {
          return (
            new Date(
              a._id.year,
              (a._id.month || 1) - 1,
              a._id.day || 1
            ).getTime() -
            new Date(
              b._id.year,
              (b._id.month || 1) - 1,
              b._id.day || 1
            ).getTime()
          );
        } else if (range === "yearly") {
          return a._id.year - b._id.year;
        } else {
          return (
            new Date(a._id.year, (a._id.month || 1) - 1).getTime() -
            new Date(b._id.year, (b._id.month || 1) - 1).getTime()
          );
        }
      });

    logger.debug(`Statistic for ${range}:`, {
      startDate,
      directPayments: directPayments.length,
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.totalAmount, 0),
      samplePayments: payments.slice(0, 3),
    });

    // Data tayyorlash
    const resultMap = new Map<string, number>();
    const current = dayjs();

    if (range === "daily") {
      // Oxirgi 30 kun uchun label'lar yaratish
      for (let i = 29; i >= 0; i--) {
        const date = current.subtract(i, "day");
        const label = date.format("DD MMM"); // "01 Nov" formatida
        resultMap.set(label, 0);
      }

      // To'lovlarni label'larga joylash
      for (const item of payments) {
        const label = dayjs(
          `${item._id.year}-${item._id.month}-${item._id.day}`
        ).format("DD MMM");
        if (resultMap.has(label)) {
          resultMap.set(label, item.totalAmount);
        }
      }
    } else if (range === "yearly") {
      for (let i = 4; i >= 0; i--) {
        const year = current.subtract(i, "year").year();
        resultMap.set(String(year), 0);
      }

      for (const item of payments) {
        const label = String(item._id.year);
        if (resultMap.has(label)) {
          resultMap.set(label, item.totalAmount);
        }
      }
    } else {
      // monthly
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      for (let i = 11; i >= 0; i--) {
        const date = current.subtract(i, "month");
        const label = monthNames[date.month()];
        resultMap.set(label, 0);
      }

      for (const item of payments) {
        const label = monthNames[(item._id.month || 1) - 1];
        if (resultMap.has(label)) {
          resultMap.set(label, item.totalAmount);
        }
      }
    }

    return {
      categories: Array.from(resultMap.keys()),
      series: Array.from(resultMap.values()),
    };
  }

  async currencyCourse() {
    const currencyCourse = await Currency.findOne().sort({
      createdAt: -1,
    });

    return currencyCourse?.amount;
  }
  async changeCurrency(amount: number) {
    await Currency.findOneAndUpdate(
      {},
      {
        name: "USD",
        amount,
      },
      {
        new: true,
        upsert: true,
        sort: { createdAt: -1 },
      }
    );

    return { message: "Joriy kurs yangilandi", status: "ok" };
  }
}

export default new DashboardService();
