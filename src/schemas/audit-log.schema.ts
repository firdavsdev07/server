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
  
  // Employee info (kim bajargan)
  employeeName?: string;
  employeeRole?: string;
  
  // General
  affectedEntities?: {
    entityType: string;
    entityId: string;
    entityName?: string;
  }[];
  
  // ✅ YANGI: ID lar (kassa va audit log uchun)
  contractId?: string; // Shartnoma ID (S0001, S0002...)
  paymentId?: string; // To'lov ID (T0001, T0002...)
  customerId?: string; // Mijoz ID (M0001, M0002...)
  
  // Mijoz ismi (to'lovlar uchun)
  customerName?: string;

  // ✅ YANGI: Request performance va browser info
  requestDuration?: number; // Request davomiyligi (ms)
  browserInfo?: {
    userAgent: string;
    isMobile: boolean;
    browser: string;
  };
  errorMessage?: string; // Xatolik xabari
  stackTrace?: string; // Stack trace
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
      
      // Employee info
      employeeName: String,
      employeeRole: String,
      
      // ✅ YANGI: ID lar (kassa va audit log uchun)
      contractId: String, // Shartnoma ID (S0001, S0002...)
      paymentId: String, // To'lov ID (T0001, T0002...)
      customerId: String, // Mijoz ID (M0001, M0002...)
      
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

      // ✅ YANGI: Performance va browser info
      requestDuration: Number, // Request davomiyligi (ms)
      browserInfo: {
        userAgent: String,
        isMobile: Boolean,
        browser: String,
      },
      errorMessage: String, // Xatolik xabari
      stackTrace: String, // Stack trace
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

// ✅ YANGI: Qo'shimcha performance indexes
AuditLogSchema.index({ 
  userId: 1, 
  action: 1, 
  timestamp: -1 
}, { 
  name: "idx_user_action_activity" 
}); // User bo'yicha filter uchun

AuditLogSchema.index({ 
  'metadata.customerName': 'text',
  'metadata.affectedEntities.entityName': 'text'
}, {
  name: "idx_search_text",
  weights: {
    'metadata.customerName': 10,
    'metadata.affectedEntities.entityName': 5
  }
}); // Search uchun text index

const AuditLog = model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLog;