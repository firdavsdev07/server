import logger from "../../../utils/logger";


import { Markup, Scenes } from "telegraf";
import Employee from "../../../schemas/employee.schema";
import { MyContext } from "../../utils/context";

const phoneScene = new Scenes.BaseScene<MyContext>("phone");

phoneScene.enter(async (ctx) => {
  console.log("📱 Phone scene entered!");
  try {

    await ctx.reply(
      "Assalomu alaykum!\n\n" +
      "📲 Manager panelga kirish uchun telefon raqamingizni yuboring:",
      Markup.keyboard([
        Markup.button.contactRequest("📱 Telefon raqamni yuborish"),
      ])
        .resize()
        .oneTime()
    );

  } catch (err: any) {
    logger.debug(" Phone scene enter error:", err.message);
  }
});

phoneScene.hears(/^\/start\b/, (ctx) => {
  return ctx.scene.enter("start");
});

phoneScene.on("contact", async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    let phoneNumber = ctx.message?.contact.phone_number;

    if (!phoneNumber.startsWith("+")) {
      phoneNumber = "+" + phoneNumber;
    }


    const employee = await Employee.findOne({
      phoneNumber: phoneNumber,
      isActive: true,
      isDeleted: false,
    }).populate("role");

    if (employee) {
      const roleName = (employee.role as any)?.name || "unknown";



      const allowedRoles = ["manager", "admin", "moderator"];

      if (!allowedRoles.includes(roleName)) {
        logger.debug("   - Foydalanuvchi roli:", roleName);
        logger.debug("   - Ruxsat berilgan rollar:", allowedRoles.join(", "));

        await ctx.reply(
          " Ruxsat yo'q\n\n" +
          "Sizda manager panelga kirish huquqi yo'q.\n" +
          `Sizning rolingiz: ${roleName}\n\n` +
          "Iltimos, administrator bilan bog'laning."
        );
        return;
      }

      // Telegram ID'ni saqlash
      employee.telegramId = telegramId.toString();
      await employee.save();

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

      logger.debug("=".repeat(60) + "\n");
    } else {

      const allEmployees = await Employee.find({
        isDeleted: false,
      }).select("phoneNumber firstName lastName isActive");

      allEmployees.forEach((emp, index) => {
        logger.debug(
          `   ${index + 1}. ${emp.phoneNumber} - ${emp.firstName} ${emp.lastName
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
    logger.debug("Stack:", e.stack);

    await ctx.reply(
      "❌ Xatolik yuz berdi.\n\n" + "Iltimos, /start ni qayta bosing."
    );
  }
});

phoneScene.on("text", async (ctx) => {
  try {

    await ctx.reply(
      "⚠️ Iltimos, telefon raqamingizni tugma orqali yuboring:",
      Markup.keyboard([
        Markup.button.contactRequest("📱 Telefon raqamni yuborish"),
      ])
        .resize()
        .oneTime()
    );
  } catch (e: any) {
    logger.debug("Text handler error:", e.message);
  }
});

export default phoneScene;
