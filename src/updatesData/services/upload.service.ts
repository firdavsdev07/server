import csv from "csvtojson";
import path from "path";
import Auth from "../../schemas/auth.schema";
import Customer from "../../schemas/customer.schema";
import logger from "../../utils/logger";
import Payment, {
  PaymentType,
  PaymentStatus,
} from "../../schemas/payment.schema";
import Contract, { ContractStatus } from "../../schemas/contract.schema";
import Employee from "../../schemas/employee.schema";
import { Role } from "../../schemas/role.schema";
import { RoleEnum } from "../../enums/role.enum";
import bcrypt from "bcryptjs";
import Notes from "../../schemas/notes.schema";

export const importContractsFromCSV = async (filePath: string) => {
  const jsonArray = await csv().fromFile(path.resolve(filePath));
  // const insertedContracts = [];

  const role = await Role.findOne({ name: RoleEnum.MANAGER });
  const roleAdmin = await Role.findOne({ name: RoleEnum.ADMIN });

  const admin = await Employee.findOne({
    role: roleAdmin,
  });

  for (const row of jsonArray) {
    if (!row.period) continue;

    let employee = null;
    if (row.employee) {
      employee = await Employee.findOne({
        firstName: row.employee,
      });

      if (!employee) {
        const hashedPassword = await bcrypt.hash("12345678", 10);

        const auth = new Auth({
          password: hashedPassword,
        });

        employee = await Employee.create({
          firstName: row.employee,
          lastName: "",
          phoneNumber: "",
          telegramId: "",
          auth: auth._id,
          role,
          isActive: true,
        });
      }
    }

    let customer = await Customer.findOne({
      firstName: row.customer,
    });

    if (!customer) {
      const auth = new Auth({});
      await auth.save();

      customer = await Customer.create({
        firstName: row.customer,
        lastName: "",
        phoneNumber: "",
        address: "",
        passportSeries: "",
        birthDate: null,
        percent: 30,
        manager: employee ? employee._id : null,
        auth: auth._id,
        isActive: true,
      });
    }

    const newNotes = await Notes.create({
      text: row.productName,
      customer,
      createBy: admin,
    });

    const percentage = calculateDiscountPercent(row.price, row.totalPrice);

    const contract = await Contract.create({
      customer: customer._id,
      productName: row.productName,
      originalPrice: parseCurrency(row.originalPrice),
      price: parseCurrency(row.price),
      initialPayment: parseCurrency(row.initialPayment),
      percentage,
      period: parseInt(row.period),
      monthlyPayment: parseCurrency(row.monthlyPayment),
      initialPaymentDueDate: parseDate(row.initialPaymentDueDate),
      notes: newNotes,
      totalPrice: parseCurrency(row.totalPrice),
      startDate: parseDate(row.startDate),
      nextPaymentDate: getNextPaymentDateFromPayments(row),
      isActive: employee ? true : false,
      info: normalizeInfoFields(row),
    });

    // paymentlar (01/2023 - 12/2025 ustunlaridan)
    const paymentKeys = Object.keys(row)
      .filter((key) => /\d{2}\/\d{4}/.test(key))
      .sort((a, b) => {
        const [am, ay] = a.split("/").map(Number);
        const [bm, by] = b.split("/").map(Number);
        return new Date(ay, am - 1).getTime() - new Date(by, bm - 1).getTime();
      });

    let totalPaid = parseCurrency(row.initialPayment); // boshlang'ich to'lov
    const monthlyPayment = parseCurrency(row.monthlyPayment);
    let currentMonthIndex = 0; // To'langan oylar soni

    logger.debug(`\nProcessing payments for ${row.customer}:`);
    logger.debug(`Monthly payment: ${monthlyPayment}$`);
    logger.debug(`Found ${paymentKeys.length} payment columns`);

    for (const key of paymentKeys) {
      if (!isValidPaymentAmount(row[key])) continue;

      const paymentAmount = parseCurrency(row[key]);
      const paymentDate = parseDateFromColumn(key);
      const paymentMonth = paymentDate.toLocaleDateString("en-US", {
        month: "2-digit",
        year: "numeric",
      });

      logger.debug(
        `\n📅 Processing ${paymentMonth}: ${paymentAmount}$ (Monthly: ${monthlyPayment}$)`
      );

      // ✅ YANGI LOGIKA: Agar to'lov oylik to'lovdan katta bo'lsa, bir necha oyga taqsimlash
      if (paymentAmount > monthlyPayment + 0.01) {
        // Katta to'lov - bir necha oyga taqsimlash
        let remainingAmount = paymentAmount;
        let monthsToDistribute = Math.floor(paymentAmount / monthlyPayment);
        const remainder = paymentAmount % monthlyPayment;

        logger.debug(
          `💰 Large payment detected: ${paymentAmount}$ = ${monthsToDistribute} oy + ${remainder.toFixed(
            2
          )}$ qoldiq`
        );

        // To'liq oylar uchun to'lovlar yaratish
        for (let i = 0; i < monthsToDistribute; i++) {
          currentMonthIndex++;
          const monthNumber = currentMonthIndex;

          // ✅ MUHIM: date - bu to'lov qaysi oyga tegishli (7-oy, 8-oy, ...)
          // confirmedAt - bu haqiqatda qachon to'langan (06/2025)
          const monthDate = new Date(paymentDate);
          monthDate.setMonth(monthDate.getMonth() + i);

          const payNotes = await Notes.create({
            text: `${paymentMonth} oyida to'langan: ${monthlyPayment}$ (${monthNumber}-oy, haqiqatda ${paymentMonth} da to'langan)`,
            customer,
            createBy: admin,
          });

          const payment = await Payment.create({
            amount: monthlyPayment,
            actualAmount: monthlyPayment,
            date: monthDate, // To'lov qaysi oyga tegishli (7-oy, 8-oy, ...)
            isPaid: true,
            paymentType: PaymentType.MONTHLY,
            status: PaymentStatus.PAID,
            notes: payNotes,
            customerId: customer._id,
            managerId: employee ? employee._id : admin?._id,
            confirmedAt: paymentDate, // ✅ Haqiqatda qachon to'langan (06/2025)
            confirmedBy: admin?._id,
          });

          await Contract.findByIdAndUpdate(contract._id, {
            $push: { payments: payment._id },
          });

          logger.debug(
            `✓ Payment ${
              i + 1
            }/${monthsToDistribute}: ${paymentMonth} - ${monthlyPayment}$`
          );

          remainingAmount -= monthlyPayment;
        }

        // Qoldiq summa uchun to'lov yaratish (agar mavjud bo'lsa)
        if (remainder > 0.01) {
          currentMonthIndex++;
          const monthNumber = currentMonthIndex;

          // ✅ MUHIM: date - bu to'lov qaysi oyga tegishli
          // confirmedAt - bu haqiqatda qachon to'langan (06/2025)
          const monthDate = new Date(paymentDate);
          monthDate.setMonth(monthDate.getMonth() + monthsToDistribute);

          const payNotes = await Notes.create({
            text: `${paymentMonth} oyida to'langan: ${remainder.toFixed(
              2
            )}$ (${monthNumber}-oy, qisman, haqiqatda ${paymentMonth} da to'langan)`,
            customer,
            createBy: admin,
          });

          const payment = await Payment.create({
            amount: monthlyPayment,
            actualAmount: remainder,
            date: monthDate, // To'lov qaysi oyga tegishli
            isPaid: true,
            paymentType: PaymentType.MONTHLY,
            status:
              remainder >= monthlyPayment - 0.01
                ? PaymentStatus.PAID
                : PaymentStatus.UNDERPAID,
            remainingAmount:
              remainder < monthlyPayment ? monthlyPayment - remainder : 0,
            notes: payNotes,
            customerId: customer._id,
            managerId: employee ? employee._id : admin?._id,
            confirmedAt: paymentDate, // ✅ Haqiqatda qachon to'langan (06/2025)
            confirmedBy: admin?._id,
          });

          await Contract.findByIdAndUpdate(contract._id, {
            $push: { payments: payment._id },
          });

          logger.debug(
            `⚠️ Remainder ${
              remainder >= monthlyPayment - 0.01 ? "PAID" : "UNDERPAID"
            }: ${remainder.toFixed(2)}$ < ${monthlyPayment}$, remaining: ${(
              monthlyPayment - remainder
            ).toFixed(2)}$`
          );
          logger.debug(
            `✓ Remainder payment: ${paymentMonth} - ${remainder.toFixed(
              2
            )}$ (status: ${
              remainder >= monthlyPayment - 0.01 ? "PAID" : "UNDERPAID"
            })`
          );
        }

        totalPaid += paymentAmount;
      } else {
        // Oddiy to'lov (oylik to'lovdan kichik yoki teng)
        currentMonthIndex++;
        const monthNumber = currentMonthIndex;

        let paymentStatus = "PAID";
        let remainingAmount = 0;

        if (paymentAmount < monthlyPayment - 0.01) {
          paymentStatus = "UNDERPAID";
          remainingAmount = monthlyPayment - paymentAmount;
          logger.debug(
            `⚠️ UNDERPAID: ${paymentAmount}$ < ${monthlyPayment}$, remaining: ${remainingAmount.toFixed(
              2
            )}$`
          );
        }

        const payNotes = await Notes.create({
          text: `${paymentMonth} oyida to'langan: ${paymentAmount}$ (${monthNumber}-oy)`,
          customer,
          createBy: admin,
        });

        const payment = await Payment.create({
          amount: monthlyPayment,
          actualAmount: paymentAmount,
          date: paymentDate,
          isPaid: true,
          paymentType: PaymentType.MONTHLY,
          status:
            paymentStatus === "PAID"
              ? PaymentStatus.PAID
              : PaymentStatus.UNDERPAID,
          remainingAmount: remainingAmount,
          notes: payNotes,
          customerId: customer._id,
          managerId: employee ? employee._id : admin?._id,
          confirmedAt: paymentDate,
          confirmedBy: admin?._id,
        });

        await Contract.findByIdAndUpdate(contract._id, {
          $push: { payments: payment._id },
        });

        totalPaid += paymentAmount;

        logger.debug(
          `✓ Payment created: ${paymentMonth} - ${paymentAmount}$ (status: ${paymentStatus})`
        );
      }

      // Balance yangilash
      const balance = await import("../../schemas/balance.schema").then(
        (m) => m.Balance
      );
      const managerId = employee ? employee._id : admin?._id;

      let managerBalance = await balance.findOne({ managerId });
      if (!managerBalance) {
        managerBalance = await balance.create({
          managerId,
          dollar: paymentAmount,
          sum: 0,
        });
        logger.debug(
          `💵 Balance created: +${paymentAmount}$ (total: ${paymentAmount}$)`
        );
      } else {
        managerBalance.dollar += paymentAmount;
        await managerBalance.save();
        logger.debug(
          `💵 Balance updated: +${paymentAmount}$ (total: ${managerBalance.dollar}$)`
        );
      }
    }

    logger.debug(`✓ Added ${currentMonthIndex} payments to contract\n`);

    // ✅ Initial payment yaratish (agar mavjud bo'lsa)
    const initialPaymentAmount = parseCurrency(row.initialPayment);
    if (initialPaymentAmount > 0) {
      const initialNotes = await Notes.create({
        text: `Boshlang'ich to'lov: ${initialPaymentAmount}$`,
        customer,
        createBy: admin,
      });

      const initialPayment = await Payment.create({
        amount: initialPaymentAmount,
        actualAmount: initialPaymentAmount,
        date: contract.startDate,
        isPaid: true,
        paymentType: PaymentType.INITIAL,
        status: PaymentStatus.PAID,
        notes: initialNotes,
        customerId: customer._id,
        managerId: employee ? employee._id : admin?._id,
        confirmedAt: contract.startDate,
        confirmedBy: admin?._id,
      });

      await Contract.findByIdAndUpdate(contract._id, {
        $push: { payments: initialPayment._id },
      });

      // Balance yangilash
      const balance = await import("../../schemas/balance.schema").then(
        (m) => m.Balance
      );
      const managerId = employee ? employee._id : admin?._id;

      let managerBalance = await balance.findOne({ managerId });
      if (!managerBalance) {
        managerBalance = await balance.create({
          managerId,
          dollar: initialPaymentAmount,
          sum: 0,
        });
      } else {
        managerBalance.dollar += initialPaymentAmount;
        await managerBalance.save();
      }

      logger.debug(
        `💵 Balance updated: +${initialPaymentAmount}$ (total: ${managerBalance.dollar}$)`
      );
      logger.debug(`✓ Initial payment created: ${initialPaymentAmount}$`);
    }

    if (totalPaid >= contract.totalPrice) {
      contract.status = ContractStatus.COMPLETED;
      await contract.save();
    }

    // insertedContracts.push(contract);
  }

  return jsonArray;
};

function normalizeInfoFields(row: Record<string, string>) {
  const toBooleanField = (val: string): boolean =>
    val?.trim().toLowerCase() === "bor";

  const normalizeReceipt = (val: string): boolean =>
    val?.trim().toLowerCase() === "true";

  return {
    box: toBooleanField(row.box),
    mbox: toBooleanField(row.mbox),
    receipt: normalizeReceipt(row.receipt),
    iCloud: toBooleanField(row.iCloud),
  };
}

function calculateDiscountPercent(
  priceStr: string,
  totalPriceStr: string
): number {
  const price = parseCurrency(priceStr);
  const totalPrice = parseCurrency(totalPriceStr);

  if (!totalPrice || isNaN(totalPrice) || isNaN(price)) return 0;

  const discount = ((totalPrice - price) * 100) / totalPrice;
  return Math.round(discount * 100) / 100; // 2 xonagacha yaxlitlash
}

const parseCurrency = (value: string | number): number => {
  if (!value && value !== 0) return 0;

  // ✅ YANGI: Agar raqam bo'lsa, to'g'ridan-to'g'ri qaytarish
  if (typeof value === "number") {
    return value;
  }

  const valueStr = String(value);
  const cleaned = valueStr.replace(/[^0-9.,]/g, "").trim();

  if (!cleaned) return 0;

  if (cleaned.includes(".") && cleaned.includes(",")) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }

  if (cleaned.includes(",") && !cleaned.includes(".")) {
    return parseFloat(cleaned.replace(",", "."));
  }

  if (cleaned.includes(".") && !cleaned.includes(",")) {
    const parts = cleaned.split(".");
    if (parts[1]?.length === 3) {
      return parseFloat(parts.join(""));
    } else {
      return parseFloat(cleaned);
    }
  }

  return parseFloat(cleaned);
};

function isValidPaymentAmount(value: string | number): boolean {
  if (value === undefined || value === null || value === "") return false;

  // ✅ YANGI: Agar raqam bo'lsa, to'g'ridan-to'g'ri tekshirish
  if (typeof value === "number") {
    return !isNaN(value) && value >= 0;
  }

  // String format
  const valueStr = String(value);

  // Naqd yoki $ belgilarini olib tashlash, faqat sonlar, nuqta yoki vergul qoldirish
  const cleaned = valueStr.replace(/[^0-9.,]/g, "").trim();

  if (!cleaned) return false;

  // Tozalangandan so'ng hali ham son bo'lishi kerak
  const number = parseCurrency(cleaned);

  // Quyidagilar valid hisoblanadi:
  // 0, 0.0, 0.00 — hammasi qabul qilinadi
  // 400m, 7mln — son emas bo'lgani uchun false qaytariladi
  const isPureNumber = /^[0-9]+([.,][0-9]{1,2})?$/.test(cleaned);

  return isPureNumber && !isNaN(number);
}

function getNextPaymentDateFromPayments(
  row: Record<string, string>
): Date | null {
  const paymentKeys = Object.keys(row).filter((key) =>
    /\d{2}\/\d{4}/.test(key)
  );
  const validPayments = paymentKeys
    .filter((key) => isValidPaymentAmount(row[key]))
    .sort((a, b) => {
      const [am, ay] = a.split("/").map(Number);
      const [bm, by] = b.split("/").map(Number);
      return new Date(ay, am - 1).getTime() - new Date(by, bm - 1).getTime();
    });

  if (validPayments.length === 0) return null;

  const [lastMonth, lastYear] = validPayments[validPayments.length - 1]
    .split("/")
    .map(Number);

  // keyingi oy
  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;

  return new Date(nextYear, nextMonth - 1, 1);
}

// Sana "DD/MM/YYYY" yoki Excel serial number bo'lsa uni Date ga aylantirish
function parseDate(value: string | number): Date | null {
  if (!value) return null;

  // ✅ YANGI: Excel serial number (masalan: 45793)
  if (typeof value === "number" || !isNaN(Number(value))) {
    const excelEpoch = new Date(1899, 11, 30); // Excel epoch: December 30, 1899
    const days = Number(value);
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);

    // Validate date
    if (!isNaN(date.getTime())) {
      logger.debug(
        `📅 Parsed Excel date: ${value} → ${date.toLocaleDateString("uz-UZ")}`
      );
      return date;
    }
  }

  // String format: "DD/MM/YYYY" yoki "DD.MM.YYYY"
  const valueStr = String(value);

  // Try DD/MM/YYYY format
  const slashParts = valueStr.split("/");
  if (slashParts.length === 3) {
    const [day, month, year] = slashParts.map(Number);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try DD.MM.YYYY format
  const dotParts = valueStr.split(".");
  if (dotParts.length === 3) {
    const [day, month, year] = dotParts.map(Number);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  logger.debug(`⚠️ Invalid date: ${value}, using current date`);
  return new Date();
}

// To‘lov ustunlari uchun (masalan "03/2024" → 2024-03-01)
function parseDateFromColumn(monthYear: string): Date {
  const [month, year] = monthYear.split("/").map(Number);
  return new Date(year, month - 1, 1);
}
