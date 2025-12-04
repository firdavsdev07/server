import { Scenes } from "telegraf";
import startScene from "./start/start";
import phoneScene from "./auth/phone";
import { MyContext } from "../utils/context";

// const stage = new Scenes.Stage<Scenes.SceneContext>([startScene, phoneScene]);
const stage = new Scenes.Stage<MyContext>([startScene, phoneScene]);
export default stage;
