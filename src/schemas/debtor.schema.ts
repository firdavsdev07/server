import { Schema, model, Document } from "mongoose";
import { IContract } from "./contract.schema";
import { IEmployee } from "./employee.schema";

export interface IDebtor extends Document {
  contractId: IContract;
  debtAmount: number;
  dueDate: Date; // YANGI - to'lov muddati
  overdueDays: number; // YANGI - kechikkan kunlar
  createBy: IEmployee;
  // ❌ O'CHIRILDI: payment, currencyDetails, currencyCourse
  // To'lovlar endi faqat Payment collection'da saqlanadi
}

const DebtorSchema = new Schema<IDebtor>(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },
    debtAmount: { type: Number, required: true },
    dueDate: { type: Date, required: true }, // YANGI
    overdueDays: { type: Number, required: true, default: 0 }, // YANGI
    createBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: false,
    },
  },
  { timestamps: true }
);

export const Debtor = model<IDebtor>("Debtor", DebtorSchema);
