import { Document, Schema } from "mongoose";
import { IEmployee } from "./employee.schema";

export interface IBase extends Document {
  isActive: boolean;
  isDeleted: boolean;
  createBy: IEmployee;
  createdAt: Date;
  updatedAt: Date;
}

export const BaseSchema = {
  isActive: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  createBy: {
    type: Schema.Types.ObjectId,
    ref: "Employee",
    required: false,
  },
};
