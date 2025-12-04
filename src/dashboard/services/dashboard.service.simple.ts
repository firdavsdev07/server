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
  async dashboard() {
    const [employeeCount, customerCount, contractCount, debtorCount] =
      await Promise.all([
        Employee.countDocuments(),
        Customer.countDocuments(),
        Contract.countDocuments(),
        Debtor.countDocuments(),
      ]);

    // Valyuta kursini olish
    const currencyCourse = await Currency.findOne().sort({ createdAt: -1 });
    const exchangeRate = currencyCourse?.amount || 12500; // Default: 1$ = 12500 so'm

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
    const balanceInSum = Math.round(calculatedBalance.dollar * exchangeRate);

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

    return {
      status: "success",
      data: {
        employees: employeeCount,
        customers: customerCount,
        contracts: contractCount,
        debtors: debtorCount,
        totalBalance: {
          dollar: calculatedBalance.dollar,
          sum: balanceInSum, // Hisoblangan so'm miqdori
        },
        financial: {
          totalContractPrice,
          initialPayment,
          paidAmount,
          remainingDebt,
        },
      },
    };
  }

  // Sodda statistic funksiya
  async statistic(range: string) {
    try {
      logger.debug("=== STATISTIC CALCULATION START ===");
      logger.debug("Range:", range);

      const now = new Date();
      logger.debug("Current date:", now);

      // Oxirgi 12 oy uchun
      const startDate = dayjs(now)
        .subtract(11, "month")
        .startOf("month")
        .toDate();
      logger.debug("Start date:", startDate);

      // Faqat Payment collection'dan ma'lumot olish
      const payments = await Payment.find({
        isPaid: true,
        date: { $gte: startDate },
      })
        .select("amount date")
        .lean();

      logger.debug("Found payments:", payments.length);
      logger.debug("Sample payments:", payments.slice(0, 3));

      // Oylik ma'lumotlar uchun
      const monthNames = [
        "Dec",
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
      ];

      // Bo'sh result yaratish
      const result = new Map<string, number>();

      // Oxirgi 12 oyni 0 bilan to'ldirish
      for (let i = 11; i >= 0; i--) {
        const date = dayjs(now).subtract(i, "month");
        const monthName = monthNames[date.month()];
        result.set(monthName, 0);
      }

      // To'lovlarni oylarga bo'lib joylashtirish
      for (const payment of payments) {
        const paymentDate = dayjs(payment.date);
        const monthName = monthNames[paymentDate.month()];

        if (result.has(monthName)) {
          const currentAmount = result.get(monthName) || 0;
          result.set(monthName, currentAmount + payment.amount);
        }
      }

      const finalResult = {
        categories: Array.from(result.keys()),
        series: Array.from(result.values()),
      };

      logger.debug("Final result:", finalResult);
      logger.debug("=== STATISTIC CALCULATION END ===");

      return finalResult;
    } catch (error) {
      logger.error("Error in statistic:", error);

      // Xato bo'lsa, bo'sh data qaytarish
      const monthNames = [
        "Dec",
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
      ];

      return {
        categories: monthNames,
        series: new Array(12).fill(0),
      };
    }
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
