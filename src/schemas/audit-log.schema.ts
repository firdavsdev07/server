import { Schema, model } from "mongoose";
import { IEmployee } from "./employee.schema";

export enum AuditAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE", 
  DELETE = "DELETE",
  PAYMENT = "PAYMENT",
  BULK_IMPORT = "BULK_IMPORT", // Excel import uchun
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  STATUS_CHANGE = "STATUS_CHANGE",
  POSTPONE = "POSTPONE",
  CONFIRM = "CONFIRM",
  REJECT = "REJECT",
  PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED",
  PAYMENT_REJECTED = "PAYMENT_REJECTED"
}

export enum AuditEntity {
  CUSTOMER = "customer",
  CONTRACT = "contract", 
  PAYMENT = "payment",
  EMPLOYEE = "employee",
  BALANCE = "balance",
  AUTH = "auth",
  EXCEL_IMPORT = "excel_import",
  EXPENSES = "expenses"
}

export interface IAuditMetadata {
  // Excel import uchun
  fileName?: string;
  totalRows?: number;
  successfulRows?: number;
  failedRows?: number;
  
  // Payment uchun
  paymentType?: string;
  paymentStatus?: string;
  amount?: number;
  actualAmount?: number; // To'langan summa
  remainingAmount?: number; // Qolgan summa
  targetMonth?: number;
  paymentCreatorId?: string; // ✅ YANGI: Pulni yig'ib to'lovni qilgan odam (managerId)
  paymentCreatorName?: string; // ✅ YANGI: Pulni yig'ib to'lovni qilgan odam ismi
  
  // Contract uchun
  contractStatus?: string;
  monthlyPayment?: number;
  totalPrice?: number;
  
  // Expenses uchun
  dollar?: number;
  sum?: number;
  expensesNotes?: string;
  managerName?: string;
  
  // General
  affectedEntities?: {
    entityType: string;
    entityId: string;
    entityName?: string;
  }[];
  
  // Mijoz ismi (to'lovlar uchun)
  customerName?: string;
}

export interface IAuditLog {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string; // Asosiy entity ID
  userId: string | IEmployee; // Kim bajargan
  userType: "employee" | "customer";
  
  // O'zgarishlar (UPDATE uchun)
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  
  // Qo'shimcha ma'lumotlar
  metadata?: IAuditMetadata;
  
  // Request info
  ipAddress?: string;
  userAgent?: string;
  
  // Sana
  timestamp: Date;
  
  // Mongoose timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
    },
    entity: {
      type: String, 
      enum: Object.values(AuditEntity),
      required: true,
    },
    entityId: {
      type: String,
      required: false, // BULK_IMPORT uchun entityId bo'lmasligi mumkin
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    userType: {
      type: String,
      enum: ["employee", "customer"],
      default: "employee",
    },
    changes: [
      {
        field: { type: String, required: true },
        oldValue: { type: Schema.Types.Mixed },
        newValue: { type: Schema.Types.Mixed },
        _id: false,
      },
    ],
    metadata: {
      // Excel import
      fileName: String,
      totalRows: Number,
      successfulRows: Number,
      failedRows: Number,
      
      // Payment
      paymentType: String,
      paymentStatus: String,
      amount: Number,
      actualAmount: Number, // To'langan summa
      remainingAmount: Number, // Qolgan summa
      targetMonth: Number,
      paymentCreatorId: String, // ✅ YANGI: Pulni yig'ib to'lovni qilgan odam (managerId)
      paymentCreatorName: String, // ✅ YANGI: Pulni yig'ib to'lovni qilgan odam ismi
      
      // Contract  
      contractStatus: String,
      monthlyPayment: Number,
      totalPrice: Number,
      
      // Expenses
      dollar: Number,
      sum: Number,
      expensesNotes: String,
      managerName: String,
      
      // Mijoz ismi
      customerName: String,
      
      // Affected entities
      affectedEntities: [
        {
          entityType: String,
          entityId: String,
          entityName: String,
          _id: false,
        },
      ],
    },
    ipAddress: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
AuditLogSchema.index({ timestamp: -1 }); // So'nggi yozuvlar uchun
AuditLogSchema.index({ userId: 1, timestamp: -1 }); // User activity uchun
AuditLogSchema.index({ entity: 1, entityId: 1, timestamp: -1 }); // Entity history uchun
AuditLogSchema.index({ action: 1, timestamp: -1 }); // Action filter uchun
AuditLogSchema.index({ 
  timestamp: -1, 
  entity: 1, 
  action: 1 
}, { 
  name: "idx_daily_activity" 
}); // Kunlik activity uchun

const AuditLog = model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLog;