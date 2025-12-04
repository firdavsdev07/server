import { Telegraf } from "telegraf";

const startBot = async (bot: Telegraf<any>) => {
  setImmediate(async () => {
    try {
      await bot.launch();
    } catch (err: any) {
      // Bot launch failed, server continues
    }
  });
};

export default startBot;
