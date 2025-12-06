import IJwtUser from "../../types/user";
import { Balance } from "../../schemas/balance.schema";
import { Types } from "mongoose";
import CurrencyCourse from "../../schemas/currency.schema";
import Payment from "../../schemas/payment.schema";
import { PaymentStatusEnum } from "../../enums/payment.enum";

class DashboardSrvice {
  async dashboard(user: IJwtUser) {
    console.log("📊 [Dashboard Service] Manager ID:", user.sub);
    
    // Valyuta kursini olish
    const currencyCourse = await CurrencyCourse.findOne().sort({
      createdAt: -1,
    });
    const exchangeRate = currencyCourse?.amount || 12500;

    // 1️⃣ BALANS - Manager'ning umumiy balansi
    const balance = await Balance.aggregate([
      {
        $match: {
          managerId: new Types.ObjectId(user.sub),
        },
      },
      {
        $project: {
          dollar: { $ifNull: ["$dollar", 0] },
          sum: {
            $round: {
              $multiply: [{ $ifNull: ["$dollar", 0] }, exchangeRate],
            },
          },
        },
      },
    ]);

    console.log("📊 [Dashboard Service] Balance found:", balance);

    const defaultBalance = {
      dollar: 0,
      sum: 0,
    };

    const balanceData = balance.length > 0 ? balance[0] : defaultBalance;

    // 2️⃣ BUGUNGI TO'LOVLAR - Faqat bugun PAID statusdagi to'lovlar
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayPayments = await Payment.aggregate([
      {
        $match: {
          managerId: new Types.ObjectId(user.sub),
          status: "PAID",
          date: { 
            $gte: today,
            $lt: tomorrow
          },
        },
      },
      {
        $group: {
          _id: null,
          totalDollar: { 
            $sum: { 
              $cond: [
                { $gt: ["$actualAmount", 0] },
                "$actualAmount",
                "$amount"
              ]
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    console.log("📊 [Dashboard Service] Today payments found:", todayPayments);

    const todayData = todayPayments.length > 0 ? {
      dollar: todayPayments[0].totalDollar || 0,
      sum: Math.round((todayPayments[0].totalDollar || 0) * exchangeRate),
      count: todayPayments[0].count || 0
    } : {
      dollar: 0,
      sum: 0,
      count: 0
    };

    const result = {
      balance: balanceData,
      today: todayData
    };

    console.log("📊 [Dashboard Service] Returning data:", result);

    return {
      status: "success",
      data: result,
    };
  }
  async currencyCourse() {
    const currencyCourse = await CurrencyCourse.findOne().sort({
      createdAt: -1,
    });

    return {
      course: currencyCourse?.amount,
      message: "success"
    };
  }
}

export default new DashboardSrvice();
