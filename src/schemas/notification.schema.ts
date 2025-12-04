import { Schema, model, Document, Types } from "mongoose";

export interface INotification extends Document {
  _id: Types.ObjectId;
  managerId: Types.ObjectId;
  type: "PAYMENT_APPROVED" | "PAYMENT_REJECTED" | "PAYMENT_POSTPONE_REMINDER";
  title: string;
  message: string;
  data: {
    paymentId: Types.ObjectId;
    customerId: Types.ObjectId;
    customerName: string;
    contractId: Types.ObjectId;
    productName: string;
    amount: number;
    status: string;
  };
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["PAYMENT_APPROVED", "PAYMENT_REJECTED", "PAYMENT_POSTPONE_REMINDER"],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      paymentId: {
        type: Schema.Types.ObjectId,
        ref: "Payment",
        required: true,
      },
      customerId: {
        type: Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
      },
      customerName: {
        type: String,
        required: true,
      },
      contractId: {
        type: Schema.Types.ObjectId,
        ref: "Contract",
        required: true,
      },
      productName: {
        type: String,
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      status: {
        type: String,
        required: true,
      },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
notificationSchema.index({ managerId: 1, createdAt: -1 });
notificationSchema.index({ managerId: 1, isRead: 1 });

const Notification = model<INotification>("Notification", notificationSchema);

export default Notification;
