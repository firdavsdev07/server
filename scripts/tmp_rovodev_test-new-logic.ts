import mongoose, { Types } from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGO_DB || "mongodb://localhost:27017/nasiya_db";

const customerSchema = new mongoose.Schema({}, { strict: false, collection: "customers" });
const contractSchema = new mongoose.Schema({}, { strict: false, collection: "contracts" });

const Customer = mongoose.model("Customer", customerSchema);
const Contract = mongoose.model("Contract", contractSchema);

async function testNewLogic() {
  try {
    console.log(`🔌 Connecting to: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected!\n");

    // Get first manager
    const firstCustomer = await Customer.findOne({ 
      manager: { $exists: true, $ne: null },
      isActive: true 
    }).lean();

    if (!firstCustomer || !firstCustomer.manager) {
      console.log("❌ No manager found!");
      return;
    }

    const managerId = new Types.ObjectId(firstCustomer.manager);
    console.log(`👤 Testing with manager ID: ${managerId}\n`);

    const filterEndDate = new Date();
    filterEndDate.setHours(23, 59, 59, 999);
    console.log(`📅 Filter date: ${filterEndDate.toISOString().split('T')[0]}\n`);

    // NEW LOGIC: Check nextPaymentDate
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
      
      // ✅ KEY CHANGE: Filter by nextPaymentDate
      {
        $match: {
          nextPaymentDate: { $lte: filterEndDate }
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
          }
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
        $group: {
          _id: "$customerData._id",
          firstName: { $first: "$customerData.firstName" },
          lastName: { $first: "$customerData.lastName" },
          phoneNumber: { $first: "$customerData.phoneNumber" },
          totalDebt: { $sum: "$remainingDebt" },
          contractsCount: { $sum: 1 },
          oldestDate: { $min: "$nextPaymentDate" },
          totalOverdueCount: { $sum: 1 }
        },
      },
      
      {
        $addFields: {
          delayDays: {
            $floor: {
              $divide: [
                { $subtract: [filterEndDate, "$oldestDate"] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
      },
      
      { $sort: { delayDays: -1, totalDebt: -1 } },
    ]);

    console.log(`✅ Found ${result.length} debtors\n`);
    
    if (result.length > 0) {
      console.log("📋 All Debtors:");
      result.forEach((debtor, idx) => {
        console.log(`${idx + 1}. ${debtor.firstName} ${debtor.lastName} - $${debtor.totalDebt} (${debtor.delayDays} days)`);
      });
    } else {
      console.log("❌ No debtors found!");
    }

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n👋 Disconnected");
  }
}

testNewLogic();
