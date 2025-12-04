// import { Markup, Scenes } from "telegraf";
import logger from "../../../utils/logger";
// import Employee from "../../../schemas/employee.schema";
// import { MyContext } from "../../utils/context";

// const startScene = new Scenes.BaseScene<MyContext>("start");

// startScene.enter(async (ctx) => {
//   try {
//     if (!ctx.from) {
//       logger.debug("❌ ctx.from mavjud emas");
//       return;
//     }

//     const telegramId = ctx.from.id;
//     logger.debug("\n" + "=".repeat(60));
//     logger.debug("🚀 START SCENE BOSHLANDI");
//     logger.debug("👤 Telegram ID:", telegramId);
//     logger.debug("📱 Username:", ctx.from.username || "yo'q");
//     logger.debug("=".repeat(60));

//     // HAR DOIM telefon raqam so'rash (professional flow)
//     logger.debug("📲 Telefon raqam so'ralmoqda...");
//     return await ctx.scene.enter("phone");

//   } catch (e: any) {
//     logger.debug("❌ Start scene ERROR:", e.message || e);
//     logger.debug("Stack:", e.stack);

//     try {
//       await ctx.reply(
//         "❌ Xatolik yuz berdi.\n\n" +
//         "Iltimos, /start ni qayta bosing yoki administrator bilan bog'laning."
//       );
//     } catch (replyErr) {
//       logger.debug("❌ Reply error:", replyErr);
//     }
//   }
// });

// export default startScene;


import { Markup, Scenes } from "telegraf";
import Employee from "../../../schemas/employee.schema";
import { MyContext } from "../../utils/context";

const startScene = new Scenes.BaseScene<MyContext>("start");

startScene.enter(async (ctx) => {
  try {
    if (!ctx.from) {
      logger.debug("❌ ctx.from mavjud emas");
      return;
    }

    const telegramId = ctx.from.id;
    logger.debug("\n" + "=".repeat(60));
    logger.debug("🚀 START SCENE BOSHLANDI");
    logger.debug("👤 Telegram ID:", telegramId);
    logger.debug("📱 Username:", ctx.from.username || "yo'q");
    logger.debug("=".repeat(60));

    // HAR DOIM telefon raqam so'rash (professional flow)
    logger.debug("📲 Telefon raqam so'ralmoqda...");
    return await ctx.scene.enter("phone");

  } catch (e: any) {
    logger.debug("❌ Start scene ERROR:", e.message || e);
    logger.debug("Stack:", e.stack);

    try {
      await ctx.reply(
        "❌ Xatolik yuz berdi.\n\n" +
        "Iltimos, /start ni qayta bosing yoki administrator bilan bog'laning."
      );
    } catch (replyErr) {
      logger.debug("❌ Reply error:", replyErr);
    }
  }
});

export default startScene;
