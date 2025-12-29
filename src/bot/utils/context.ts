import { Context, Scenes } from "telegraf";

export interface MySession extends Scenes.SceneSession<Scenes.SceneSessionData> {
  phone?: string;
}

export interface MyContext extends Context {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext>;
}

