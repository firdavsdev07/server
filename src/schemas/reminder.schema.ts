import { Schema, model, Document } from "mongoose";
import { ICustomer } from "./customer.schema";
import { IContract } from "./contract.schema";
import { IEmployee } from "./employee.schema";

export interface IReminder extends Document {
  contractId: IContract;
  customerId: ICustomer;
  managerId: IEmployee;
  targetMonth: number;
  reminderDate: Date;
  reason: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer", 
      required: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    targetMonth: {
      type: Number,
      required: true,
    },
    reminderDate: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      default: "Mijozning so'rovi bo'yicha eslatma",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for performance
ReminderSchema.index({ contractId: 1, targetMonth: 1 }, { unique: true });
ReminderSchema.index({ reminderDate: 1, isActive: 1 });

const Reminder = model<IReminder>("Reminder", ReminderSchema);

export default Reminder;