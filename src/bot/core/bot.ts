// import { Scenes, Telegraf } from "telegraf";
// import config from "../utils/config";
// import { SceneContext } from "telegraf/typings/scenes";

import { Telegraf } from "telegraf";
import config from "../utils/config";
import { MyContext } from "../utils/context";

if (!config.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not defined in config");
}

// Bot instance
const bot = new Telegraf<MyContext>(config.BOT_TOKEN, {
  handlerTimeout: 90000, // 90 second handler timeout
});

export default bot;
