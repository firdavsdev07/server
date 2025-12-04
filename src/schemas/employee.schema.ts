import { Document, Schema, model } from "mongoose";

import { Permission } from "../enums/permission.enum";
import { IAuth } from "./auth.schema";
import { IRole } from "./role.schema";
import { BaseSchema, IBase } from "./base.schema";
export interface IEmployee extends IBase {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  telegramId: string;
  role: IRole;
  permissions: Permission[];
  auth: IAuth;
}

const EmployeeSchema: Schema<IEmployee> = new Schema<IEmployee>(
  {
    ...BaseSchema,
    firstName: { type: String },
    lastName: { type: String },
    phoneNumber: { type: String },
    telegramId: {
      type: String,
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    permissions: {
      type: [String],
      enum: Object.values(Permission),
      default: [],
    },
    auth: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Employee = model<IEmployee>("Employee", EmployeeSchema);

export default Employee;
