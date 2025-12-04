import { Scenes } from "telegraf";

export interface MySession extends Scenes.WizardSessionData {
  phone?: string;
}

export interface MyContext extends Scenes.WizardContext<MySession> {}
