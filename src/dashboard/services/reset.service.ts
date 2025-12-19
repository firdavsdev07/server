import Customer from "../../schemas/customer.schema";
import Contract from "../../schemas/contract.schema";
import Payment from "../../schemas/payment.schema";
import { Balance } from "../../schemas/balance.schema";
import { Expenses } from "../../schemas/expenses.schema";
import { Debtor } from "../../schemas/debtor.schema";
import Auth from "../../schemas/auth.schema";
import Notes from "../../schemas/notes.schema";
import Employee from "../../schemas/employee.schema";
import AuditLog from "../../schemas/audit-log.schema"; // ✅ Audit log uchun
import { RoleEnum } from "../../enums/role.enum";
import { checkAllContractsStatus } from "../../utils/checkAllContractsStatus";
import fs from "fs";
import path from "path";
import logger from "../../utils/logger";

class ResetService {
  /**
   * Yuklangan fayllarni o'chirish
   */
  private async deleteUploadedFiles() {
    try {
      logger.debug("🗑️ === DELETING UPLOADED FILES ===");

      const uploadsDir = path.join(__dirname, "../../../uploads");
      const directories = ["passport", "photo", "shartnoma"];

      let totalDeleted = 0;

      for (const dir of directories) {
        const dirPath = path.join(uploadsDir, dir);

        // Directory mavjudligini tekshirish
        if (!fs.existsSync(dirPath)) {
          logger.debug(`⚠️ Directory not found: ${dirPath}`);
          continue;
        }

        // Directory ichidagi barcha fayllarni o'qish
        const files = fs.readdirSync(dirPath);

        for (const file of files) {
          // .gitkeep faylini o'chirmaslik
          if (file === ".gitkeep") {
            continue;
          }

          const filePath = path.join(dirPath, file);

          try {
            // Faylni o'chirish
            fs.unlinkSync(filePath);
            totalDeleted++;
            logger.debug(`✅ Deleted: ${dir}/${file}`);
          } catch (error: any) {
            logger.error(`❌ Error deleting ${filePath}:`, error.message);
          }
        }
      }

      logger.debug(`✅ Total files deleted: ${totalDeleted}`);
      return totalDeleted;
    } catch (error: any) {
      logger.error("❌ Error deleting uploaded files:", error);
      throw new Error(`Fayllarni o'chirishda xatolik: ${error.message}`);
    }
  }

  /**
   * Excel fayllarni o'chirish (updatesData/uploads)
   */
  private async deleteExcelFiles() {
    try {
      logger.debug("🗑️ === DELETING EXCEL FILES ===");

      const excelDir = path.join(__dirname, "../../updatesData/uploads");

      // Directory mavjudligini tekshirish
      if (!fs.existsSync(excelDir)) {
        logger.debug(`⚠️ Excel directory not found: ${excelDir}`);
        return 0;
      }

      // Directory ichidagi barcha fayllarni o'qish
      const files = fs.readdirSync(excelDir);
      let totalDeleted = 0;

      for (const file of files) {
        // .gitkeep faylini o'chirmaslik
        if (file === ".gitkeep") {
          continue;
        }

        const filePath = path.join(excelDir, file);

        try {
          // Faylni o'chirish
          fs.unlinkSync(filePath);
          totalDeleted++;
          logger.debug(`✅ Deleted Excel: ${file}`);
        } catch (error: any) {
          logger.error(`❌ Error deleting ${filePath}:`, error.message);
        }
      }

      logger.debug(`✅ Total Excel files deleted: ${totalDeleted}`);
      return totalDeleted;
    } catch (error: any) {
      logger.error("❌ Error deleting Excel files:", error);
      throw new Error(`Excel fayllarni o'chirishda xatolik: ${error.message}`);
    }
  }

  /**
   * Barcha mijozlar, shartnomalar, to'lovlar va balanslarni tozalash
   * Faqat super admin va adminlar uchun
   */
  async resetAllData() {
    try {
      // 1. Barcha to'lovlarni o'chirish
      const deletedPayments = await Payment.deleteMany({});
      logger.debug(`✅ ${deletedPayments.deletedCount} ta to'lov o'chirildi`);

      // 2. Barcha shartnomalarni o'chirish
      const deletedContracts = await Contract.deleteMany({});
      logger.debug(
        `✅ ${deletedContracts.deletedCount} ta shartnoma o'chirildi`
      );

      // 3. Barcha qarzdorlarni o'chirish
      const deletedDebtors = await Debtor.deleteMany({});
      logger.debug(`✅ ${deletedDebtors.deletedCount} ta qarzdor o'chirildi`);

      // 4. Barcha xarajatlarni o'chirish
      const deletedExpenses = await Expenses.deleteMany({});
      logger.debug(`✅ ${deletedExpenses.deletedCount} ta xarajat o'chirildi`);

      // 5. Barcha mijozlarni o'chirish
      const customers = await Customer.find({}).select("auth");
      const customerAuthIds = customers.map((c) => c.auth);

      const deletedCustomers = await Customer.deleteMany({});
      logger.debug(`✅ ${deletedCustomers.deletedCount} ta mijoz o'chirildi`);

      // 6. Mijozlarning auth ma'lumotlarini o'chirish
      const deletedCustomerAuths = await Auth.deleteMany({
        _id: { $in: customerAuthIds },
      });
      logger.debug(
        `✅ ${deletedCustomerAuths.deletedCount} ta mijoz auth o'chirildi`
      );

      // 7. Mijozlarning notes ma'lumotlarini o'chirish (customer field orqali)
      const deletedNotes = await Notes.deleteMany({});
      logger.debug(`✅ ${deletedNotes.deletedCount} ta notes o'chirildi`);

      // 8. Barcha balanslarni 0 ga qaytarish (o'chirmaslik, faqat reset)
      const updatedBalances = await Balance.updateMany(
        {},
        { $set: { dollar: 0, sum: 0 } }
      );
      logger.debug(
        `✅ ${updatedBalances.modifiedCount} ta balans 0 ga qaytarildi`
      );

      // 9. Yuklangan fayllarni o'chirish (passport, photo, shartnoma)
      const deletedFiles = await this.deleteUploadedFiles();
      logger.debug(`✅ ${deletedFiles} ta fayl o'chirildi`);

      // 10. Excel fayllarni o'chirish
      const deletedExcelFiles = await this.deleteExcelFiles();
      logger.debug(`✅ ${deletedExcelFiles} ta Excel fayl o'chirildi`);

      // 11. Barcha audit loglarni o'chirish
      const deletedAuditLogs = await AuditLog.deleteMany({});
      logger.debug(`✅ ${deletedAuditLogs.deletedCount} ta audit log o'chirildi`);

      return {
        success: true,
        message: "Barcha ma'lumotlar va fayllar muvaffaqiyatli tozalandi",
        deletedCounts: {
          payments: deletedPayments.deletedCount,
          contracts: deletedContracts.deletedCount,
          debtors: deletedDebtors.deletedCount,
          expenses: deletedExpenses.deletedCount,
          customers: deletedCustomers.deletedCount,
          customerAuths: deletedCustomerAuths.deletedCount,
          notes: deletedNotes.deletedCount,
          balancesReset: updatedBalances.modifiedCount,
          uploadedFiles: deletedFiles,
          excelFiles: deletedExcelFiles,
          auditLogs: deletedAuditLogs.deletedCount, // ✅ Audit loglar
        },
      };
    } catch (error: any) {
      logger.error("❌ Reset xatolik:", error);
      throw new Error(`Ma'lumotlarni tozalashda xatolik: ${error.message}`);
    }
  }

  /**
   * Reset qilish mumkinligini tekshirish
   * Faqat Super Admin (ADMIN_PHONENUMBER) reset qila oladi
   */
  async canReset(userId: string) {
    try {
      // Auth'ni tekshirish
      const auth = await Auth.findById(userId);
      if (!auth) {
        logger.debug("❌ Auth not found:", userId);

        // Development mode'da ruxsat berish
        if (process.env.NODE_ENV === "development") {
          logger.debug("⚠️ Development mode - allowing reset (auth not found)");
          return { canReset: true };
        }

        return {
          canReset: false,
          reason: "Foydalanuvchi topilmadi.",
        };
      }

      // Employee orqali role olish
      const employee = await Employee.findOne({ auth: userId }).populate(
        "role"
      );

      if (!employee) {
        logger.debug("❌ Employee not found for auth:", userId);

        // Development mode'da authenticated user'lar reset qila oladi
        if (process.env.NODE_ENV === "development") {
          logger.debug(
            "⚠️ Development mode - allowing reset (no employee found)"
          );
          return { canReset: true };
        }

        return {
          canReset: false,
          reason: "Xodim topilmadi. Faqat Super Admin reset qila oladi.",
        };
      }

      const role = employee.role as any;
      logger.debug(
        "👤 User:",
        employee.firstName,
        "| Role:",
        role?.name,
        "| Phone:",
        employee.phoneNumber
      );

      // Super Admin phone number'ini .env'dan olish
      const superAdminPhone = process.env.ADMIN_PHONENUMBER;

      // Faqat Super Admin reset qila oladi
      if (
        employee.phoneNumber === superAdminPhone &&
        role?.name === RoleEnum.ADMIN
      ) {
        logger.debug("✅ Super Admin - reset allowed");
        return { canReset: true };
      }

      // Development mode'da admin va moderatorlar ham reset qila oladi
      if (process.env.NODE_ENV === "development") {
        const allowedRoles = [RoleEnum.ADMIN, RoleEnum.MODERATOR];
        if (allowedRoles.includes(role?.name)) {
          logger.debug("⚠️ Development mode - allowing reset for:", role?.name);
          return { canReset: true };
        }
      }

      return {
        canReset: false,
        reason: "Faqat Super Admin reset qila oladi.",
      };
    } catch (error: any) {
      logger.error("❌ canReset error:", error);
      throw new Error(`Ruxsat tekshirishda xatolik: ${error.message}`);
    }
  }

  /**
   * Reset statistikasini olish (nechta yozuv bor)
   */
  async getResetStats() {
    try {
      const [
        customersCount,
        contractsCount,
        paymentsCount,
        debtorsCount,
        expensesCount,
        balances,
      ] = await Promise.all([
        Customer.countDocuments(),
        Contract.countDocuments(),
        Payment.countDocuments(),
        Debtor.countDocuments(),
        Expenses.countDocuments(),
        Balance.find({}).select("dollar sum"),
      ]);

      const totalBalance = balances.reduce(
        (acc, b) => ({
          dollar: acc.dollar + (b.dollar || 0),
          sum: acc.sum + (b.sum || 0),
        }),
        { dollar: 0, sum: 0 }
      );

      return {
        customers: customersCount,
        contracts: contractsCount,
        payments: paymentsCount,
        debtors: debtorsCount,
        expenses: expensesCount,
        totalBalance,
      };
    } catch (error: any) {
      throw new Error(`Statistika olishda xatolik: ${error.message}`);
    }
  }

  /**
   * Barcha shartnomalarning statusini tekshirish
   */
  async checkAllContractsStatus() {
    return await checkAllContractsStatus();
  }
}

export default new ResetService();
