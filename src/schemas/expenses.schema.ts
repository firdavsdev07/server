import { Schema, model, Types } from "mongoose";
import { IEmployee } from "./employee.schema";

export interface IExpenses {
  managerId: IEmployee;
  dollar: number;
  sum: number;
  isActive: boolean;
  notes: string;
}

const ExpensesSchema = new Schema<IExpenses>(
  {
    managerId: {
      type: Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    dollar: { type: Number, default: 0 },
    sum: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    notes: { type: String, required: true },
  },
  { timestamps: true }
);

export const Expenses = model<IExpenses>("Expenses", ExpensesSchema);
