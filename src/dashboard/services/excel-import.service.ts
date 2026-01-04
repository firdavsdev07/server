import XLSX from "xlsx";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import Customer from "../../schemas/customer.schema";
import Contract from "../../schemas/contract.schema";
import logger from "../../utils/logger";
import Payment, {
  PaymentType,
  PaymentStatus,
} from "../../schemas/payment.schema";
import Notes from "../../schemas/notes.schema";
import Auth from "../../schemas/auth.schema";
import { Balance } from "../../schemas/balance.schema";
import BaseError from "../../utils/base.error";
import { Types } from "mongoose";
import auditLogService from "../../services/audit-log.service";

dayjs.extend(customParseFormat);

interface ExcelRow {
  startDate: string;
  initialPaymentDueDate: string;
  nextPaymentDate: string;
  customer: string;
  productName: string;
  originalPrice: number;
  price: number;
  initialPayment: number;
  period: number;
  monthlyPayment: number;
  totalPrice: number;
  percentage: number;
  notes?: string;
  box?: string;
  mbox?: string;
  receipt?: string;
  iCloud?: string;
  [key: string]: any; // Oylik to'lovlar uchun
}

class ExcelImportService {
  /**
   * Excel fayldan ma'lumotlarni o'qish
   * ✅ YANGI: To'liq validatsiya va xatolarni qaytarish
   */
  private readExcelFile(filePath: string): any[] {
    try {
      // 1. Fayl mavjudligini tekshirish
      const fs = require("fs");
      if (!fs.existsSync(filePath)) {
        throw BaseError.NotFoundError(
          `Excel fayl topilmadi: ${filePath}`
        );
      }

      // 2. Faylni o'qish
      let workbook;
      try {
        workbook = XLSX.readFile(filePath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw BaseError.BadRequest(
          `Excel faylni o'qib bo'lmadi. Fayl buzilgan yoki noto'g'ri formatda: ${errorMessage}`
        );
      }

      // 3. Sheet mavjudligini tekshirish
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw BaseError.BadRequest(
          "Excel faylda hech qanday sheet topilmadi"
        );
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw BaseError.BadRequest(
          `Sheet "${sheetName}" topilmadi yoki bo'sh`
        );
      }

      // 4. JSON formatga o'tkazish
      // ✅ TUZATISH: raw: true - Excel sanalarni serial number sifatida olish
      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,  // Excel serial number'larni o'zgartirmasdan olish
        dateNF: "yyyy-mm-dd",
      });

      // 5. Ma'lumot mavjudligini tekshirish
      if (!data || data.length < 2) {
        throw BaseError.BadRequest(
          "Excel faylda ma'lumot yo'q yoki faqat sarlavha mavjud (kamida 2 qator bo'lishi kerak)"
        );
      }

      logger.debug(`✅ Excel fayl o'qildi: ${data.length} qator topildi`);

      return data;
    } catch (error) {
      // BaseError'larni to'g'ridan-to'g'ri qaytarish
      if (error instanceof BaseError) {
        throw error;
      }

      // Boshqa xatolarni BaseError ga o'tkazish
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw BaseError.InternalServerError(
        `Excel faylni qayta ishlashda xatolik: ${errorMessage}`
      );
    }
  }

  /**
   * Sanani parse qilish (Excel formatidan)
   * ✅ TUZATILDI: Excel serial number'larni to'g'ri handle qilish + Timezone fix
   */
  private parseDate(dateStr: any, isDay: boolean = false): Date {
    if (!dateStr) {
      return new Date();
    }

    // ✅ TUZATILDI: Excel serial number (number) ni Date'ga aylantirish
    // MUAMMO: Excel sanalarni UTC da saqlaydi, lekin GMT+5 tufayli 1 kun orqaga ketadi
    // YECHIM: UTC qiymatlarni to'g'ridan-to'g'ri ishlatish (Date.UTC bilan)
    if (typeof dateStr === 'number') {
      // Excel serial number to Date (UTC formatda)
      // Excel: 1 = 1900-01-01, lekin 1900 leap year bug bor
      // 25569 = 1970-01-01 (UNIX epoch)
      const utc_days = Math.floor(dateStr - 25569);
      const utc_value = utc_days * 86400; // seconds
      const date_info = new Date(utc_value * 1000); // milliseconds
      
      // ✅ TUZATISH: UTC qiymatlarni Date.UTC yordamida to'g'ri yaratish
      // Bu local timezone ta'sirini to'liq olib tashlaydi
      const year = date_info.getUTCFullYear();
      const month = date_info.getUTCMonth();
      const day = date_info.getUTCDate();
      const localDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      
      logger.debug(`  📅 Excel serial ${dateStr} → ${dayjs(localDate).format('YYYY-MM-DD')} (UTC: ${year}-${(month+1).toString().padStart(2,'0')}-${day.toString().padStart(2,'0')})`);
      return localDate;
    }

    // String formatga aylantirish
    const dateString = String(dateStr);

    // Agar faqat kun raqami bo'lsa (1-31)
    if (isDay && /^\d{1,2}$/.test(dateString)) {
      const day = parseInt(dateString);
      if (day >= 1 && day <= 31) {
        // Hozirgi oy va yildan foydalanish
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), day);
      }
    }

    // "5/7/25" yoki "7/7/25" formatini to'g'ri parse qilish
    const shortDateMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (shortDateMatch) {
      let first = parseInt(shortDateMatch[1]);
      let second = parseInt(shortDateMatch[2]);
      let year = parseInt(shortDateMatch[3]);

      // 2-xonali yilni to'g'ri yilga aylantirish
      year += 2000; // 25 → 2025

      // Agar year 2050+ bo'lsa, bu xato
      if (year > 2050) {
        year = 2025; // Default: 2025
        logger.warn(`⚠️ Suspicious year in "${dateString}", using 2025`);
      }

      // Oy va kunni aniqlash
      let month: number, day: number;
      if (first > 12) {
        // kun/oy format: 18/5/25 → day=18, month=5
        day = first;
        month = second;
      } else if (second > 12) {
        // oy/kun format: 5/18/25 → month=5, day=18
        month = first;
        day = second;
      } else {
        // Ikkalasi ham 12 dan kichik - kun/oy format deb hisoblaymiz
        // Sabab: DD/MM/YY format ko'proq ishlatiladi
        day = first;
        month = second;
      }

      // Validatsiya
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        logger.warn(`⚠️ Invalid date "${dateString}", using current date`);
        return new Date();
      }

      return new Date(year, month - 1, day);
    }

    // Boshqa formatlar: "2025-05-07" yoki "5/7/2025"
    let parsed = dayjs(dateString, ["M/D/YYYY", "YYYY-MM-DD", "DD/MM/YYYY", "D/M/YYYY"], true);

    if (!parsed.isValid()) {
      // Agar parse bo'lmasa, hozirgi sanani qaytarish
      logger.warn(`Invalid date: ${dateString}, using current date`);
      return new Date();
    }

    return parsed.toDate();
  }

  /**
   * Balance yangilash
   */
  private async updateBalance(
    managerId: Types.ObjectId,
    amount: number
  ): Promise<void> {
    try {
      let balance = await Balance.findOne({ managerId });

      if (!balance) {
        balance = await Balance.create({
          managerId,
          dollar: amount,
          sum: 0,
        });
        logger.debug(`    💵 Balance created: ${amount}$`);
      } else {
        balance.dollar += amount;
        await balance.save();
        logger.debug(
          `    💵 Balance updated: +${amount}$ (total: ${balance.dollar}$)`
        );
      }
    } catch (error) {
      logger.error("❌ Error updating balance:", error);
      throw error;
    }
  }

  /**
   * Mijoz yaratish yoki topish
   * ✅ TUZATISH: contractStartDate parametri qo'shildi
   */
  private async findOrCreateCustomer(
    customerName: string,
    managerId: Types.ObjectId,
    contractStartDate?: Date
  ): Promise<Types.ObjectId> {
    // Mijoz nomini tozalash
    const fullName = customerName.trim();

    // Mijozni topish
    let customer = await Customer.findOne({
      fullName: { $regex: new RegExp(`^${fullName}$`, "i") },
      isDeleted: false,
    });

    if (!customer) {
      // Yangi mijoz yaratish
      const auth = await Auth.create({});

      // ✅ TUZATISH: Mijoz yaratilgan sanani shartnoma sanasiga moslashtirish
      const customerData: any = {
        fullName,
        phoneNumber: "",
        address: "",
        passportSeries: "",
        birthDate: new Date(),
        manager: managerId,
        auth: auth._id,
        isActive: true,
        isDeleted: false,
      };

      // Agar shartnoma sanasi berilgan bo'lsa, createdAt ni o'rnatish
      if (contractStartDate) {
        customerData.createdAt = contractStartDate;
        customerData.updatedAt = contractStartDate;
        logger.debug(`  📅 Setting customer createdAt to: ${dayjs(contractStartDate).format('YYYY-MM-DD')}`);
      }

      customer = await Customer.create(customerData);

      logger.debug(`✅ Created new customer: ${fullName}`);

      // 🔍 AUDIT LOG: Customer yaratish
      try {
        await auditLogService.logCustomerCreate(
          customer._id.toString(),
          fullName,
          managerId.toString(),
          { source: "excel_import", fileName: "excel_import" }
        );
        logger.debug(`✅ Customer audit log created: ${customer._id}`);
      } catch (auditError) {
        logger.error("❌ Error creating customer audit log:", auditError);
      }
    } else {
      logger.debug(`✓ Found existing customer: ${fullName}`);
    }

    return customer._id as Types.ObjectId;
  }

  /**
   * Oylik to'lovlarni parse qilish
   */
  private parseMonthlyPayments(
    row: any[],
    headers: string[],
    startIndex: number
  ): Array<{ month: string; year: number; amount: number }> {
    const payments: Array<{ month: string; year: number; amount: number }> = [];

    for (let i = startIndex; i < headers.length; i++) {
      const header = headers[i];
      const value = row[i];

      // Oy/yil formatini parse qilish: "01/2023"
      const match = header.match(/^(\d{2})\/(\d{4})$/);
      if (!match) continue;

      const month = match[1]; // "01"
      const year = parseInt(match[2]); // 2023

      // Agar to'lov summasi mavjud bo'lsa
      if (value && !isNaN(parseFloat(value))) {
        payments.push({
          month,
          year,
          amount: parseFloat(value),
        });
      }
    }

    return payments;
  }

  /**
   * ✅ To'g'ri targetMonth hisoblash (Excel import uchun)
   * Shartnoma boshlangan oydan keyin birinchi to'lov = 1-oy
   * 
   * MISOL:
   * - Shartnoma: 18/05/2025 (May 18, 2025)
   * - 06/2025 to'lovi (June) -> targetMonth = 1 (birinchi oylik to'lov)
   * - 07/2025 to'lovi (July) -> targetMonth = 2 (ikkinchi oylik to'lov)
   * 
   * LOGIKA:
   * - Oy farqini hisoblash: paymentDate - contractStartMonth
   * - Agar monthsDiff = 0 (shartnoma oyi) -> targetMonth = 1
   * - Agar monthsDiff = 1 (keyingi oy) -> targetMonth = 1
   * - Agar monthsDiff = 2 -> targetMonth = 2
   * 
   * ⚠️ MUHIM: Birinchi oylik to'lov odatda shartnoma oyidan KEYIN boshlanadi
   */
  private calculateTargetMonthFixed(
    paymentMonth: string,
    paymentYear: number,
    contractStartDate: Date
  ): number {
    const paymentDate = dayjs(`${paymentYear}-${paymentMonth}-01`);
    const contractStartMonth = dayjs(contractStartDate).startOf("month");

    // Oy farqi (0 = shu oy, 1 = keyingi oy, 2 = ikkinchi oy, ...)
    const monthsDiff = paymentDate.diff(contractStartMonth, "month");

    // monthsDiff = 0 -> targetMonth = 1 (shartnoma oyidagi to'lov)
    // monthsDiff = 1 -> targetMonth = 1 (birinchi oylik to'lov)
    // monthsDiff = 2 -> targetMonth = 2 (ikkinchi oylik to'lov)

    return Math.max(1, monthsDiff);
  }

  /**
   * Contract status va nextPaymentDate'ni qayta tekshirish
   * Import tugagandan keyin chaqiriladi
   */
  private async recheckContractStatusAndNextPayment(
    contract: any,
    startDate: Date
  ): Promise<void> {
    try {
      logger.debug("  🔍 Rechecking contract status and nextPaymentDate...");

      // Barcha to'lovlarni populate qilish
      await contract.populate("payments");

      // To'langan summa (actualAmount yoki amount)
      const totalPaid = (contract.payments as any[])
        .filter((p: any) => p.isPaid)
        .reduce((sum: number, p: any) => sum + (p.actualAmount || p.amount), 0);

      // Prepaid balance qo'shish
      const totalPaidWithPrepaid = totalPaid + (contract.prepaidBalance || 0);

      logger.debug(`    💰 Total paid: ${totalPaid.toFixed(2)}$`);
      logger.debug(`    💰 Total price: ${contract.totalPrice}$`);
      logger.debug(`    ✅ Paid with prepaid: ${totalPaidWithPrepaid.toFixed(2)}$`);

      // Status yangilash
      if (totalPaidWithPrepaid >= contract.totalPrice) {
        contract.status = "completed";
        logger.debug("    ✅ Contract status: COMPLETED");
      } else {
        contract.status = "active";
        logger.debug("    ✅ Contract status: ACTIVE");
      }

      // ✅ TUZATISH: nextPaymentDate va originalPaymentDay ni to'g'ri hisoblash
      // Eng oxirgi to'langan oyni topish
      const paidMonthlyPayments = (contract.payments as any[])
        .filter(
          (p: any) =>
            p.isPaid &&
            p.paymentType === "monthly" &&
            p.targetMonth &&
            p.targetMonth > 0
        );

      // Eng oxirgi to'langan oy
      const lastPaidMonth = paidMonthlyPayments.length > 0
        ? Math.max(...paidMonthlyPayments.map((p: any) => p.targetMonth || 0))
        : 0;

      logger.debug(`    📅 Paid monthly payments: ${paidMonthlyPayments.length}`);
      logger.debug(`    📅 Last paid month: ${lastPaidMonth}`);

      // Keyingi to'lov oyi
      const nextPaymentMonth = lastPaidMonth + 1;

      // ✅ YANGI: originalPaymentDay ni o'rnatish (agar mavjud bo'lmasa)
      const originalDay = contract.originalPaymentDay || dayjs(startDate).date();
      if (!contract.originalPaymentDay) {
        contract.originalPaymentDay = originalDay;
        logger.debug(`    📅 originalPaymentDay set: ${originalDay}`);
      }

      // Agar barcha oylar to'langan bo'lmasa, nextPaymentDate yangilash
      if (nextPaymentMonth <= contract.period) {
        // ✅ TUZATISH: startDate dan nextPaymentMonth oy qo'shish
        // Misol: startDate = 2025-06-17, lastPaidMonth = 5, nextPaymentMonth = 6
        // nextPaymentDate = 2025-06-17 + 6 oy = 2025-12-17
        const nextPaymentDate = dayjs(startDate)
          .add(nextPaymentMonth, "month")
          .date(originalDay)
          .toDate();

        contract.nextPaymentDate = nextPaymentDate;

        logger.debug(`    📅 Next payment month: ${nextPaymentMonth}`);
        logger.debug(`    📅 nextPaymentDate: ${dayjs(nextPaymentDate).format("YYYY-MM-DD")}`);
      } else {
        logger.debug("    ✅ All payments completed, no next payment date");
      }

      // Shartnomani saqlash
      await contract.save();

      logger.debug("  ✅ Contract status and nextPaymentDate updated");
    } catch (error) {
      logger.error("  ❌ Error rechecking contract:", error);
      // Davom etish (xatoni ignor qilish)
    }
  }

  /**
   * Excel to'lov uchun batafsil izoh yaratish
   * ✅ YANGI: Excel'dagi original ma'lumotni izohda ko'rsatish
   */
  private createExcelPaymentNote(
    excelAmount: number,
    excelMonth: string,
    excelYear: number,
    expectedMonthlyPayment: number,
    monthsCount: number,
    remainder: number,
    baseTargetMonth: number,
    paymentDate: Date,
    isSplitPayment: boolean = false,
    splitIndex: number = 0
  ): string {
    let note = `📊 EXCEL TO'LOV MA'LUMOTI:\n`;
    note += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    note += `Asl to'lov: ${excelAmount.toFixed(2)}$\n`;
    note += `Excel oy/yil: ${excelMonth}/${excelYear}\n`;
    note += `To'lov sanasi: ${dayjs(paymentDate).format("DD/MM/YYYY")}\n\n`;

    if (isSplitPayment && monthsCount > 1) {
      note += `✅ Bu to'lov ${monthsCount} oyga bo'lindi:\n`;
      for (let i = 0; i < monthsCount; i++) {
        const targetMonth = baseTargetMonth + i;
        const marker = i === splitIndex ? "👉" : "  ";
        note += `${marker} ${i + 1}. ${targetMonth}-oy: ${expectedMonthlyPayment.toFixed(
          2
        )}$\n`;
      }
      if (remainder > 0.01) {
        note += `\n💰 Qoldiq: ${remainder.toFixed(2)}$\n`;
        note += `   Keyingi oy (${baseTargetMonth + monthsCount
          }-oy)ga qo'llanadi\n`;
      }
      note += `\n👉 Bu to'lov - ${splitIndex + 1}/${monthsCount} qism\n`;
    } else {
      note += `💵 Oylik to'lov: ${expectedMonthlyPayment.toFixed(2)}$\n`;

      const diff = excelAmount - expectedMonthlyPayment;
      if (Math.abs(diff) > 0.01) {
        if (diff < 0) {
          note += `⚠️ KAM TO'LANGAN: ${Math.abs(diff).toFixed(2)}$ qoldi\n`;
        } else {
          note += `✨ ORTIQCHA: ${diff.toFixed(2)}$ qo'shimcha\n`;
        }
      } else {
        note += `✅ TO'LIQ TO'LANGAN\n`;
      }
    }

    return note;
  }

  /**
   * To'lovlarni yaratish - YANGI ALGORITM
   * ✅ YANGI YONDASHUV:
   * 1. Har bir oyga TENG to'lov taqsimlash (totalPrice - initialPayment) / period
   * 2. Excel to'lov qaysi oylarni qamrab olganini aniqlash
   * 3. Shu oylarga to'langan sanani qo'yish
   * 4. "Kam to'langan" muammosini hal qilish
   */
  private async createPayments(
    contractId: Types.ObjectId,
    customerId: Types.ObjectId,
    customerName: string,
    managerId: Types.ObjectId,
    monthlyPayments: Array<{ month: string; year: number; amount: number }>,
    expectedMonthlyPayment: number,
    contractStartDate: Date,
    totalContractPrice?: number,
    period?: number,
    initialPayment?: number
  ): Promise<Types.ObjectId[]> {
    const paymentIds: Types.ObjectId[] = [];

    // Shartnoma boshlanish kunini olish (masalan: 18)
    const contractDay = dayjs(contractStartDate).date();

    // ✅ YANGI: Barcha Excel to'lovlarning jami summasi
    const totalExcelPayments = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);
    const isContractFullyPaid = totalContractPrice
      ? (totalExcelPayments >= totalContractPrice * 0.99) // 1% xatolik margin
      : false;

    logger.debug(`\n  📊 YANGI ALGORITM - TENG TAQSIMLASH`);
    logger.debug(`  📊 Total Excel payments: ${totalExcelPayments}$`);
    logger.debug(`  📊 Total contract price: ${totalContractPrice || 'N/A'}$`);
    logger.debug(`  📊 Period: ${period} months`);
    logger.debug(`  📊 Monthly payment (expected): ${expectedMonthlyPayment}$`);
    logger.debug(`  ${isContractFullyPaid ? '✅' : '⚠️'} Contract fully paid: ${isContractFullyPaid}\n`);

    // ✅ YANGI: Excel to'lovlarni oylar bo'yicha map qilish
    // Har bir Excel to'lov qaysi oylarni qamrab olganini aniqlash
    const paymentMonthMapping: Array<{
      monthIndex: number; // 1, 2, 3, ...
      expectedAmount: number; // 220$
      paidAmount: number; // Excel'dan
      paidDate: Date; // Excel sanasi
      status: string;
    }> = [];

    let currentMonthIndex = 1;
    let remainingExcelAmount = 0;

    // ✅ YANGI ALGORITM: Excel to'lovlarni teng oylik to'lovlarga bo'lish
    for (const payment of monthlyPayments) {
      const paymentDate = dayjs(
        `${payment.year}-${payment.month}-${contractDay}`
      ).toDate();

      logger.debug(
        `\n  📅 Processing Excel payment: ${payment.month}/${payment.year} = ${payment.amount}$`
      );

      let excelAmountToProcess = payment.amount + remainingExcelAmount;
      logger.debug(`    💰 Amount to process: ${excelAmountToProcess}$ (${payment.amount}$ + ${remainingExcelAmount}$ qoldiq)`);

      // Excel to'lovni oylik to'lovlarga bo'lish
      while (excelAmountToProcess >= expectedMonthlyPayment * 0.95 && currentMonthIndex <= (period || 12)) {
        const amountForThisMonth = Math.min(excelAmountToProcess, expectedMonthlyPayment);

        paymentMonthMapping.push({
          monthIndex: currentMonthIndex,
          expectedAmount: expectedMonthlyPayment,
          paidAmount: amountForThisMonth,
          paidDate: paymentDate,
          status: amountForThisMonth >= expectedMonthlyPayment * 0.99 ? 'PAID' : 'UNDERPAID'
        });

        logger.debug(
          `    ✓ ${currentMonthIndex}-oy: ${amountForThisMonth.toFixed(2)}$ (${paymentMonthMapping[paymentMonthMapping.length - 1].status})`
        );

        excelAmountToProcess -= amountForThisMonth;
        currentMonthIndex++;
      }

      // Qoldiq summani saqlash
      remainingExcelAmount = excelAmountToProcess;

      if (remainingExcelAmount > 0.01) {
        logger.debug(`    💰 Qoldiq keyingi Excel to'lovga: ${remainingExcelAmount.toFixed(2)}$`);
      }
    }

    // ✅ YANGI: Oxirgi qoldiq summani tekshirish
    // MUHIM: Agar qoldiq initialPayment ga teng bo'lsa, uni ignor qilamiz
    // Sabab: Bu boshlang'ich to'lov, alohida yaratilgan
    if (remainingExcelAmount > 0.01) {
      // Qoldiq initialPayment ga teng yoki yaqinmi? (masalan: 150$)
      const isInitialPaymentRemainder = initialPayment && Math.abs(remainingExcelAmount - initialPayment) < 1;

      if (isInitialPaymentRemainder) {
        // ✅ Bu boshlang'ich to'lov qiymati, ignor qilamiz
        // Chunki initial payment alohida yaratilgan
        logger.debug(
          `    ℹ️ Qoldiq ${remainingExcelAmount.toFixed(2)}$ = initialPayment, ignor qilinadi (alohida yaratilgan)`
        );
      } else if (currentMonthIndex <= (period || 12)) {
        // Oddiy qoldiq to'lov (period ichida)
        paymentMonthMapping.push({
          monthIndex: currentMonthIndex,
          expectedAmount: expectedMonthlyPayment,
          paidAmount: remainingExcelAmount,
          paidDate: monthlyPayments[monthlyPayments.length - 1]
            ? dayjs(`${monthlyPayments[monthlyPayments.length - 1].year}-${monthlyPayments[monthlyPayments.length - 1].month}-${contractDay}`).toDate()
            : new Date(),
          status: isContractFullyPaid ? 'PAID' : 'UNDERPAID'
        });
        logger.debug(
          `    ✓ ${currentMonthIndex}-oy (qoldiq): ${remainingExcelAmount.toFixed(2)}$ (${isContractFullyPaid ? 'PAID' : 'UNDERPAID'})`
        );
      }
    }

    logger.debug(`\n  📊 Jami: ${paymentMonthMapping.length} oylik to'lov yaratiladi\n`);

    // ✅ YANGI: paymentMonthMapping asosida Payment yaratish
    for (const monthPayment of paymentMonthMapping) {
      // ✅ TUZATISH: Belgilangan to'lov sanasi = startDate + monthIndex oy
      // Misol: startDate = 2025-06-17, monthIndex = 1 → 2025-07-17 (1-oy to'lovi)
      // Misol: startDate = 2025-06-17, monthIndex = 6 → 2025-12-17 (6-oy to'lovi)
      const contractDay = dayjs(contractStartDate).date();
      const paymentDate = dayjs(contractStartDate)
        .add(monthPayment.monthIndex, 'month')
        .date(contractDay)
        .toDate();

      const noteText = `${monthPayment.monthIndex}-oy to'lovi - ${dayjs(monthPayment.paidDate).format('DD.MM.YYYY')}\n${monthPayment.paidAmount.toFixed(2)}$`;

      const notes = await Notes.create({
        text: noteText,
        customer: customerId,
        createBy: managerId,
      });

      const paymentDoc = await Payment.create({
        amount: monthPayment.expectedAmount,
        actualAmount: monthPayment.paidAmount,
        date: paymentDate,
        isPaid: true,
        paymentType: PaymentType.MONTHLY,
        customerId,
        managerId,
        notes: notes._id,
        status: monthPayment.status === 'PAID' ? PaymentStatus.PAID : PaymentStatus.UNDERPAID,
        expectedAmount: monthPayment.expectedAmount,
        remainingAmount: monthPayment.status === 'UNDERPAID'
          ? monthPayment.expectedAmount - monthPayment.paidAmount
          : 0,
        confirmedAt: monthPayment.paidDate,
        confirmedBy: managerId,
        targetMonth: monthPayment.monthIndex,
        createdAt: monthPayment.paidDate, // ✅ Excel'dagi to'lov sanasini o'rnatish
        updatedAt: monthPayment.paidDate, // ✅ Yangilanish sanasini ham o'rnatish
      });

      paymentIds.push(paymentDoc._id);

      // 🔍 AUDIT LOG: Payment yaratish
      try {
        await auditLogService.logPaymentCreate(
          paymentDoc._id.toString(),
          contractId.toString(),
          customerId.toString(),
          customerName, // ✅ To'g'ri customer ismi
          monthPayment.paidAmount,
          "monthly",
          monthPayment.monthIndex,
          managerId.toString(),
          {
            source: "excel_import",
            fileName: "excel_import",
            actualAmount: monthPayment.paidAmount,
            expectedAmount: monthPayment.paidAmount,
            paymentStatus: "PAID"
          }
        );
        logger.debug(`✅ Payment audit log created: ${paymentDoc._id}`);
      } catch (auditError) {
        logger.error("❌ Error creating payment audit log:", auditError);
      }

      logger.debug(
        `  ✓ Payment created: ${monthPayment.monthIndex}-oy - ${monthPayment.paidAmount.toFixed(2)}$ (${monthPayment.status})`
      );
    }

    // ✅ Balance faqat 1 marta yangilanadi (barcha Excel to'lovlar jami)
    await this.updateBalance(managerId, totalExcelPayments);
    logger.debug(`  💵 Balance updated: +${totalExcelPayments}$`);

    return paymentIds;

  }

  /**
   * Excel fayldan import qilish
   */
  async importFromExcel(
    filePath: string,
    managerId: string
  ): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    logger.debug("=== EXCEL IMPORT STARTED ===");
    logger.debug("File:", filePath);
    logger.debug("Manager ID:", managerId);

    const managerObjectId = new Types.ObjectId(managerId);
    const data = this.readExcelFile(filePath);

    if (data.length < 2) {
      throw BaseError.BadRequest("Excel fayl bo'sh yoki noto'g'ri formatda");
    }

    const headers = data[0] as string[];
    const rows = data.slice(2); // Birinchi 2 qatorni o'tkazib yuborish (header va izoh)

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Oylik to'lovlar boshlanadigan indeksni topish
    const monthlyPaymentsStartIndex = headers.findIndex((h) =>
      /^\d{2}\/\d{4}$/.test(h)
    );

    logger.debug(`Found ${rows.length} rows to import`);
    logger.debug(
      `Monthly payments start at column ${monthlyPaymentsStartIndex}`
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any[];
      const rowNumber = i + 3; // Excel'dagi qator raqami

      try {
        // Bo'sh qatorlarni o'tkazib yuborish
        if (!row[3] || !row[4]) {
          logger.debug(`Row ${rowNumber}: Skipped (empty)`);
          continue;
        }

        logger.debug(`\nProcessing row ${rowNumber}: ${row[3]}`);

        // 1. Shartnoma boshlanish sanasini olish (mijoz yaratish uchun kerak)
        const contractStartDate = this.parseDate(row[0]);

        // 2. Mijozni yaratish yoki topish (✅ shartnoma sanasini o'tkazamiz)
        const customerName = row[3] ? row[3].toString().trim() : "Unknown Customer";
        const customerId = await this.findOrCreateCustomer(
          customerName,
          managerObjectId,
          contractStartDate // ✅ Shartnoma sanasini o'tkazish
        );

        // 3. Shartnoma ma'lumotlarini parse qilish
        const initialPayment = parseFloat(row[7]) || 0;
        const period = parseInt(row[8]) || 12;
        const monthlyPayment = parseFloat(row[9]) || 0;
        const excelTotalPrice = parseFloat(row[10]) || 0;

        // ✅ YANGI: totalPrice validatsiyasi va qayta hisoblash
        // Hisoblangan qiymat: initialPayment + (monthlyPayment × period)
        const calculatedTotalPrice = initialPayment + (monthlyPayment * period);

        // Farqni tekshirish (1$ dan kam bo'lsa - Excel qiymatini ishlatamiz)
        const priceDifference = Math.abs(excelTotalPrice - calculatedTotalPrice);
        let finalTotalPrice = excelTotalPrice;

        if (priceDifference > 1) {
          // ⚠️ Katta farq bor - hisoblangan qiymatni ishlatamiz
          logger.debug(`  ⚠️ WARNING: TotalPrice mismatch!`);
          logger.debug(`    Excel totalPrice: ${excelTotalPrice}$`);
          logger.debug(`    Calculated: ${initialPayment}$ + (${monthlyPayment}$ × ${period}) = ${calculatedTotalPrice}$`);
          logger.debug(`    Difference: ${priceDifference.toFixed(2)}$`);
          logger.debug(`    ✅ Using calculated value: ${calculatedTotalPrice}$`);
          finalTotalPrice = calculatedTotalPrice;
        } else {
          // ✅ Farq kichik yoki yo'q - Excel qiymatini ishlatamiz
          logger.debug(`  ✅ TotalPrice validation passed:`);
          logger.debug(`    Excel: ${excelTotalPrice}$ | Calculated: ${calculatedTotalPrice}$ | Diff: ${priceDifference.toFixed(2)}$`);
          logger.debug(`    Using Excel value: ${excelTotalPrice}$`);
        }

        const contractData = {
          startDate: contractStartDate, // ✅ Oldindan parse qilingan sana
          initialPaymentDueDate: contractStartDate, // ✅ FIXED: startDate bilan bir xil
          nextPaymentDate: this.parseDate(row[2]),
          customer: customerId,
          productName: row[4] || "Unknown",
          originalPrice: parseFloat(row[5]) || 0,
          price: parseFloat(row[6]) || 0,
          initialPayment: initialPayment,
          period: period,
          monthlyPayment: monthlyPayment,
          totalPrice: finalTotalPrice, // ✅ FIXED: Validatsiya qilingan qiymat
          percentage: parseFloat(row[11]) || 30,
          notes: row[12] || "",
          box: row[13] === "1" || row[13] === "true",
          mbox: row[14] === "1" || row[14] === "true",
          receipt: row[15] === "1" || row[15] === "true",
          iCloud: row[16] === "1" || row[16] === "true",
        };

        // 3. Notes yaratish - oddiy placeholder (keyinroq yangilanadi)
        const notes = await Notes.create({
          text: "Excel'dan import qilinmoqda...",
          customer: customerId,
          createBy: managerObjectId,
        });

        // 4. Shartnoma yaratish
        // ✅ TUZATISH: createdAt ni startDate ga tenglashtirish
        const contract = await Contract.create({
          customer: customerId,
          productName: contractData.productName,
          originalPrice: contractData.originalPrice,
          price: contractData.price,
          initialPayment: contractData.initialPayment,
          percentage: contractData.percentage,
          period: contractData.period,
          monthlyPayment: contractData.monthlyPayment,
          totalPrice: contractData.totalPrice,
          startDate: contractData.startDate,
          nextPaymentDate: contractData.nextPaymentDate,
          initialPaymentDueDate: contractData.initialPaymentDueDate,
          notes: notes._id,
          status: "active",
          isActive: true,
          isDeleted: false,
          info: {
            box: contractData.box,
            mbox: contractData.mbox,
            receipt: contractData.receipt,
            iCloud: contractData.iCloud,
          },
          payments: [],
          createBy: managerObjectId,
          createdAt: contractData.startDate, // ✅ Excel'dagi shartnoma yaratilgan sanani o'rnatish
          updatedAt: contractData.startDate, // ✅ Yangilanish sanasini ham o'rnatish
        });

        logger.debug(`  ✓ Contract created: ${contract._id}`);

        // 🔍 AUDIT LOG: Contract yaratish
        try {
          const customerFullName = `${contractData.productName}`;
          await auditLogService.logContractCreate(
            contract._id.toString(),
            customerId.toString(),
            customerFullName,
            contractData.productName,
            contractData.totalPrice,
            managerId.toString(),
            { source: "excel_import", fileName: "excel_import" }
          );
          logger.debug(`✅ Contract audit log created: ${contract._id}`);
        } catch (auditError) {
          logger.error("❌ Error creating contract audit log:", auditError);
        }

        // 5. Oylik to'lovlarni parse qilish va yaratish
        const monthlyPayments = this.parseMonthlyPayments(
          row,
          headers,
          monthlyPaymentsStartIndex
        );

        logger.debug(`  Found ${monthlyPayments.length} monthly payments`);

        // ✅ YANGI: Batafsil izoh yaratish (Contract notes uchun)
        const contractDay = dayjs(contractData.startDate).date();
        let detailedNotes = `📊 EXCEL'DAN IMPORT QILINGAN\n`;
        detailedNotes += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Boshlang'ich to'lov
        detailedNotes += `💰 Boshlang'ich to'lov:\n`;
        detailedNotes += `   ${contractData.initialPayment.toFixed(2)}$ (${dayjs(contractData.startDate).format('DD.MM.YYYY')})\n\n`;

        // Oylik to'lovlar
        if (monthlyPayments.length > 0) {
          detailedNotes += `📅 Oylik to'lovlar:\n`;
          monthlyPayments.forEach((payment) => {
            const paymentDate = dayjs(`${payment.year}-${payment.month}-${contractDay}`).format('DD.MM.YYYY');
            detailedNotes += `   • ${payment.month}/${payment.year}: ${payment.amount.toFixed(2)}$ (${paymentDate})\n`;
          });
          const totalMonthlyPayments = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);
          detailedNotes += `\n✅ Jami: ${contractData.totalPrice.toFixed(2)}$ (${contractData.initialPayment.toFixed(2)}$ + ${totalMonthlyPayments.toFixed(2)}$)\n`;
        }

        // Agar user o'z izohi bo'lsa
        if (contractData.notes && contractData.notes.trim()) {
          detailedNotes += `\n📝 Qo'shimcha izoh:\n${contractData.notes}`;
        }

        // Notes'ni yangilash
        notes.text = detailedNotes;
        await notes.save();
        logger.debug(`  ✓ Notes updated with detailed info`);

        if (monthlyPayments.length > 0) {
          const paymentIds = await this.createPayments(
            contract._id as Types.ObjectId,
            customerId,
            customerName, // ✅ Customer ismi
            managerObjectId,
            monthlyPayments,
            contractData.monthlyPayment,
            contractData.startDate,
            contractData.totalPrice, // ✅ YANGI: totalPrice ni o'tkazish
            contractData.period, // ✅ YANGI: period ni o'tkazish
            contractData.initialPayment // ✅ YANGI: initialPayment ni o'tkazish
          );

          // Contract'ga to'lovlarni qo'shish
          if (!contract.payments) {
            contract.payments = [];
          }
          contract.payments.push(...(paymentIds as any));
          await contract.save();

          logger.debug(`  ✓ Added ${paymentIds.length} payments to contract`);
        }

        // 6. Boshlang'ich to'lovni yaratish (agar mavjud bo'lsa)
        // ⚠️ MUHIM: Boshlang'ich to'lov balance ga QO'SHILMAYDI
        // Chunki totalPrice allaqachon initialPayment ni o'z ichiga oladi
        if (contractData.initialPayment > 0) {
          // ✅ YANGI: Boshlang'ich to'lov uchun batafsil izoh
          let initialNoteText = `📊 BOSHLANG'ICH TO'LOV\n`;
          initialNoteText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          initialNoteText += `💰 Summa: ${contractData.initialPayment.toFixed(2)}$\n`;
          initialNoteText += `📦 Shartnoma: ${contractData.productName}\n`;
          initialNoteText += `📅 Sana: ${dayjs(contractData.startDate).format("DD.MM.YYYY")}\n`;
          initialNoteText += `💵 Jami narx: ${contractData.totalPrice.toFixed(2)}$\n`;
          initialNoteText += `📊 Oylik to'lov: ${contractData.monthlyPayment.toFixed(2)}$\n`;
          initialNoteText += `⏰ Muddat: ${contractData.period} oy\n`;
          initialNoteText += `\n✅ TO'LANGAN (Excel import)\n`;

          const initialNotes = await Notes.create({
            text: initialNoteText,
            customer: customerId,
            createBy: managerObjectId,
          });

          const initialPayment = await Payment.create({
            amount: contractData.initialPayment,
            actualAmount: contractData.initialPayment, // ✅ FIXED
            date: contractData.startDate,
            isPaid: true,
            paymentType: PaymentType.INITIAL,
            customerId,
            managerId: managerObjectId,
            notes: initialNotes._id,
            status: PaymentStatus.PAID,
            confirmedAt: contractData.startDate,
            confirmedBy: managerObjectId,
            targetMonth: 0, // ✅ FIXED: Initial payment = 0 (oy emas)
            createdAt: contractData.startDate, // ✅ Excel'dagi shartnoma sanasini o'rnatish
            updatedAt: contractData.startDate, // ✅ Yangilanish sanasini ham o'rnatish
          });

          contract.payments.push(initialPayment._id as any);
          await contract.save();

          // ⚠️ TUZATILDI: Balance'ni yangilamaymiz (ikki marta hisoblash oldini olish)
          // Sabab: totalPrice = initialPayment + (monthlyPayment * period)
          // Faqat oylik to'lovlar balance ga qo'shiladi

          logger.debug(
            `  ✓ Initial payment created: ${contractData.initialPayment}$ (NOT added to balance)`
          );
        }

        // ✅ YANGI: Contract status va nextPaymentDate tekshirish
        await this.recheckContractStatusAndNextPayment(
          contract,
          contractData.startDate
        );

        // ✅ TUZATILDI: Qolgan oylar uchun to'lovlar yaratilMAYDI
        // Sabab: Excel import faqat to'langan to'lovlar uchun ishlatiladi
        // Qolgan oylar uchun to'lovlar keyinchalik (to'lov qilinganda) avtomatik yaratiladi
        
        logger.debug(`  ℹ️ Excel import: Faqat to'langan to'lovlar import qilindi (qolgan oylar uchun to'lovlar yaratilmaydi)`);

        successCount++;
        logger.debug(`✅ Row ${rowNumber} imported successfully`);
      } catch (error: any) {
        failedCount++;
        const errorMsg = `Row ${rowNumber}: ${error.message}`;
        errors.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    logger.debug("\n=== EXCEL IMPORT COMPLETED ===");
    logger.debug(`Success: ${successCount}`);
    logger.debug(`Failed: ${failedCount}`);

    // 🔍 AUDIT LOG: Excel import yakunlandi
    const fileName = filePath.split('/').pop() || 'unknown.xlsx';
    const totalRows = rows.length;

    // Affected entities ni yig'ish (bu yerda oddiy hisobot)
    const affectedEntities: {
      entityType: string;
      entityId: string;
      entityName: string;
    }[] = [];

    // Success entities qo'shish
    for (let i = 0; i < successCount; i++) {
      affectedEntities.push({
        entityType: "contract",
        entityId: `import-${i}`,
        entityName: `Import ${i + 1}`,
      });
    }

    // 🔍 AUDIT LOG: Excel import yakunlandi
    try {
      logger.debug("📝 Creating Excel Import audit log...", {
        fileName,
        totalRows,
        successCount,
        failedCount,
        managerId,
        affectedEntitiesCount: affectedEntities.length
      });

      await auditLogService.logExcelImport(
        fileName,
        totalRows,
        successCount,
        failedCount,
        managerId,
        affectedEntities
      );

      logger.info("✅ Excel Import audit log created successfully");
    } catch (auditError) {
      logger.error("❌ Error creating Excel Import audit log:", auditError);
      logger.error("❌ Audit error details:", {
        message: (auditError as Error).message,
        stack: (auditError as Error).stack,
        fileName,
        managerId
      });
    }

    return {
      success: successCount,
      failed: failedCount,
      errors,
    };
  }
}

export default new ExcelImportService();
