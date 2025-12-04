import { Document, Schema, model } from "mongoose";

export interface IAuth extends Document {
  password: string;
}

const AuthSchema: Schema<IAuth> = new Schema<IAuth>(
  {
    password: { type: String },
  },
  {
    timestamps: true,
  }
);

const Auth = model<IAuth>("Auth", AuthSchema);

export default Auth;
