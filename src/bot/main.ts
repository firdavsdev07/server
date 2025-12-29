// import { session } from "telegraf";
import logger from "../utils/logger";
// import axiosInstance from "../service/server/api";
import bot from "./core/bot";
import session from "./core/session";
import stage from "./scenes";

bot.use(session);
bot.use(stage.middleware());

bot.command("speed", async (ctx) => {
  const start = Date.now();
  await new Promise((res) => setTimeout(res, 50));
  const ms = Date.now() - start;
  await ctx.reply(`🚀 Bot javob berish tezligi: ${ms} ms`);
});

bot.start(async (ctx) => {
  console.log("📥 /start command received from:", ctx.from?.id);
  try {
    if (ctx.chat.type === "private") {
      console.log("🚀 /start buyrug'i boshlandi, entering start scene...");
      await ctx.scene.enter("start");
      console.log("✅ Successfully entered start scene");
    }
  } catch (error) {
    console.error("❌ Start command error:", error);
    logger.error("❌ Start command error:", error);
    await ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
  }
});

bot.catch((err, ctx) => {
  logger.debug(`Bot handler error ${err}`);
  ctx.reply("Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.");
});

export default bot;
