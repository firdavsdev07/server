// models/Role.ts
import { Schema, model, Document } from "mongoose";
import { Permission } from "../enums/permission.enum";
import { RoleEnum } from "../enums/role.enum";

export interface IRole extends Document {
  name: RoleEnum;
  permissions: Permission[];
}

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      enum: Object.values(RoleEnum),
      default: RoleEnum.SELLER,
      required: true,
      unique: true,
    },
    permissions: {
      type: [String],
      enum: Object.values(Permission),
      required: true,
      default: [],
    },
  },
  { timestamps: true }
);

export const Role = model<IRole>("Role", RoleSchema);
