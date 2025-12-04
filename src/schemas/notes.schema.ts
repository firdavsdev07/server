import { model, Schema } from "mongoose";
import { ICustomer } from "./customer.schema";
import { IEmployee } from "./employee.schema";
import { BaseSchema, IBase } from "./base.schema";

export interface INotes extends IBase {
  text: string;
  customer: ICustomer;
  createBy: IEmployee;
}

const NotesSchema = new Schema<INotes>(
  {
    ...BaseSchema,
    text: { type: String, required: true },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    createBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Notes = model<INotes>("Notes", NotesSchema);

export default Notes;
