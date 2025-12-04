import { Schema, model } from "mongoose";

export interface ICurrency {
  name: string;
  amount: number;
}

const CurrencySchema: Schema<ICurrency>  = new Schema<ICurrency>(
  {
    name: { type: String, required: true, unique: true, default: "USD" },
    amount: { type: Number, required: true, unique: true, default: 0 },
  },
  {
    timestamps: true,
  }
);

const Currency = model<ICurrency>(
  "Currency",
  CurrencySchema
);

export default Currency;
