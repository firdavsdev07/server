// import { Markup, Scenes } from "telegraf";
import logger from "../../../utils/logger";
// import Employee from "../../../schemas/employee.schema";
// import { MyContext } from "../../utils/context";

// const phoneScene = new Scenes.BaseScene<MyContext>("phone");

// phoneScene.enter(async (ctx) => {
//   try {
//     await ctx.reply(
//       "Telefon raqamingizni kiriting: ",
//       Markup.keyboard([
//         Markup.button.contactRequest("📱 Telefon raqamni yuborish"),
//       ])
//         .resize()
//         .oneTime()
//     );
//   } catch (err: any) {
//     // Error handling
//   }
// });

// phoneScene.hears(/^\/start\b/, (ctx) => ctx.scene.enter("start"));

// phoneScene.on("contact", async (ctx) => {
//   try {
//     const telegramId = ctx.from.id;
//     let phoneNumber = ctx.message?.contact.phone_number;

//     if (!phoneNumber.startsWith("+")) {
//       phoneNumber = "+" + phoneNumber;
//     }

//     const employee = await Employee.findOne({
//       phoneNumber: phoneNumber,
//       isActive: true,
//       isDeleted: false,
//     });
//     if (employee) {
//       employee.telegramId = telegramId.toString();
//       await employee.save();

//       await ctx.reply(
//         `${employee.firstName} ${employee.lastName}, shaxsingiz tasdiqlandi.`
//       );

//       return await ctx.scene.enter("start");
//     } else {
//       await ctx.reply(
//         "Kechirasiz, sizning raqamingiz ro'yxatdan o'tmagan yoki faolsiz."
//       );
//       return;
//     }
//   } catch (e) {
//     // Error handling
//   }
// });

// phoneScene.on("text", async (ctx) => {
//   try {
//     await ctx.reply(
//       "Iltimos, telefon raqamingizni tugma orqali yuboring: ",
//       Markup.keyboard([
//         Markup.button.contactRequest("📱 Telefon raqamni yuborish"),
//       ])
//         .resize()
//         .oneTime()
//     );
//   } catch (e) {
//     // Error handling
//   }
// });

// export default phoneScene;

import { Markup, Scenes } from "telegraf";
import Employee from "../../../schemas/employee.schema";
import { MyContext } from "../../utils/context";

const phoneScene = new Scenes.BaseScene<MyContext>("phone");

phoneScene.enter(async (ctx) => {
  try {
    logger.debug("\n" + "=".repeat(60));
    logger.debug("📱 PHONE SCENE BOSHLANDI");
    logger.debug("=".repeat(60));

    await ctx.reply(
      "👋 Assalomu alaykum!\n\n" +
        "📲 Manager panelga kirish uchun telefon raqamingizni yuboring:",
      Markup.keyboard([
        Markup.button.contactRequest("📱 Telefon raqamni yuborish"),
      ])
        .resize()
        .oneTime()
    );

    logger.debug("✅ Telefon raqam so'rash xabari yuborildi");
  } catch (err: any) {
    logger.debug("❌ Phone scene enter error:", err.message);
  }
});

phoneScene.hears(/^\/start\b/, (ctx) => {
  logger.debug("🔄 /start buyrug'i qabul qilindi, start scene'ga qaytish");
  return ctx.scene.enter("start");
});

phoneScene.on("contact", async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    let phoneNumber = ctx.message?.contact.phone_number;

    if (!phoneNumber.startsWith("+")) {
      phoneNumber = "+" + phoneNumber;
    }

    logger.debug("\n" + "=".repeat(60));
    logger.debug("📞 TELEFON RAQAM QABUL QILINDI");
    logger.debug("📱 Raqam:", phoneNumber);
    logger.debug("👤 Telegram ID:", telegramId);
    logger.debug("=".repeat(60));

    // Bazadan FAQAT manager rollidagi employee'larni qidirish
    logger.debug("🔍 Bazadan manager qidirilmoqda...");

    const employee = await Employee.findOne({
      phoneNumber: phoneNumber,
      isActive: true,
      isDeleted: false,
    }).populate("role");

    if (employee) {
      const roleName = (employee.role as any)?.name || "unknown";

      logger.debug("✅ EMPLOYEE TOPILDI:");
      logger.debug("   - Ism:", employee.firstName, employee.lastName);
      logger.debug("   - Rol:", roleName);
      logger.debug("   - Telefon:", employee.phoneNumber);
      logger.debug("   - Faol:", employee.isActive);

      // Faqat manager, admin, moderator rollariga ruxsat
      const allowedRoles = ["manager", "admin", "moderator"];

      if (!allowedRoles.includes(roleName)) {
        logger.debug("❌ RUXSAT YO'Q: Rol manager emas");
        logger.debug("   - Foydalanuvchi roli:", roleName);
        logger.debug("   - Ruxsat berilgan rollar:", allowedRoles.join(", "));

        await ctx.reply(
          "❌ Ruxsat yo'q\n\n" +
            "Sizda manager panelga kirish huquqi yo'q.\n" +
            `Sizning rolingiz: ${roleName}\n\n` +
            "Iltimos, administrator bilan bog'laning."
        );
        return;
      }

      // Telegram ID'ni saqlash
      employee.telegramId = telegramId.toString();
      await employee.save();

      logger.debug("✅ Telegram ID saqlandi");

      logger.debug("🔄 Manager panelga o'tilmoqda...");

      // Manager panelni ko'rsatish
      const webAppUrl = process.env.BOT_WEB_APP_URL || "https://manager.craftly.uz";

      await ctx.reply(
        `✅ Tasdiqlandi!\n\n` +
          `👤 ${employee.firstName} ${employee.lastName}\n` +
          `🎯 Rol: ${roleName}\n\n` +
          `🎉 Tabriklaymiz! Endi manager panelga kirishingiz mumkin:`,
        Markup.inlineKeyboard([
          [Markup.button.webApp("🚀 Manager Panelga Kirish", webAppUrl)],
        ])
      );

      logger.debug("✅ Manager panel tugmasi yuborildi");
      logger.debug("=".repeat(60) + "\n");
    } else {
      logger.debug("❌ EMPLOYEE TOPILMADI");
      logger.debug("   - Qidirilgan raqam:", phoneNumber);
      logger.debug("   - Sabab: Bazada yo'q yoki faol emas");

      // Debug: Barcha employee'larni ko'rsatish
      const allEmployees = await Employee.find({
        isDeleted: false,
      }).select("phoneNumber firstName lastName isActive");

      logger.debug("📋 Bazadagi barcha employee'lar:");
      allEmployees.forEach((emp, index) => {
        logger.debug(
          `   ${index + 1}. ${emp.phoneNumber} - ${emp.firstName} ${
            emp.lastName
          } (Faol: ${emp.isActive})`
        );
      });
      logger.debug("=".repeat(60) + "\n");

      await ctx.reply(
        "❌ Ruxsat yo'q\n\n" +
          "Sizda ushbu bo'limga kirish uchun yetarli huquq yo'q. " +
          "Agar bu xatolik deb hisoblasangiz, iltimos, administrator bilan bog'laning.\n\n" +
          `📞 Yuborilgan raqam: ${phoneNumber}`
      );
    }
  } catch (e: any) {
    logger.debug("❌ PHONE SCENE ERROR:", e.message);
    logger.debug("Stack:", e.stack);

    await ctx.reply(
      "❌ Xatolik yuz berdi.\n\n" + "Iltimos, /start ni qayta bosing."
    );
  }
});

phoneScene.on("text", async (ctx) => {
  try {
    logger.debug("⚠️ Text yuborildi, telefon tugmasini ko'rsatish");

    await ctx.reply(
      "⚠️ Iltimos, telefon raqamingizni tugma orqali yuboring:",
      Markup.keyboard([
        Markup.button.contactRequest("📱 Telefon raqamni yuborish"),
      ])
        .resize()
        .oneTime()
    );
  } catch (e: any) {
    logger.debug("❌ Text handler error:", e.message);
  }
});

export default phoneScene;
