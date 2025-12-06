import { Schema, model, Types } from "mongoose";
import { IEmployee } from "./employee.schema";

export interface IBalance {
  managerId: IEmployee;
  dollar: number;
  sum?: number; // Optional, faqat display uchun
}

const BalanceSchema = new Schema<IBalance>(
  {
    managerId: {
      type: Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
    },
    dollar: { type: Number, default: 0 },
    sum: { type: Number, default: 0, required: false }, // Optional field
  },
  { timestamps: true }
);

export const Balance = model<IBalance>("Balance", BalanceSchema);
