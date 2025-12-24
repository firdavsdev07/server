import AuditLog, { AuditAction, AuditEntity, IAuditLog, IAuditMetadata } from "../schemas/audit-log.schema";
import logger from "../utils/logger";
import { Types } from "mongoose";

class AuditLogService {
  /**
   * Audit log yozuv yaratish
   */
  async createLog(data: {
    action: AuditAction;
    entity: AuditEntity;
    entityId?: string;
    userId: string;
    userType?: "employee" | "customer";
    changes?: {
      field: string;
      oldValue: any;
      newValue: any;
    }[];
    metadata?: IAuditMetadata;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      logger.debug("🔍 AuditLogService.createLog called with data:", {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        userType: data.userType || "employee",
        changesCount: data.changes?.length || 0,
        hasMetadata: !!data.metadata
      });

      const auditLogData = {
        ...data,
        userType: data.userType || "employee",
        timestamp: new Date(),
      };

      logger.debug("🔍 Creating audit log with final data:", auditLogData);

      const result = await AuditLog.create(auditLogData);
      
      logger.debug(`📝 Audit log created successfully: ${data.action} ${data.entity} by ${data.userId}`, {
        auditLogId: result._id,
        timestamp: result.timestamp
      });
    } catch (error) {
      logger.error("❌ Error creating audit log:", error);
      logger.error("❌ Audit log error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
        inputData: data
      });
      // Audit log xatosi asosiy jarayonni to'xtatmasligi kerak
    }
  }

  /**
   * Mijoz yaratish audit log
   */
  async logCustomerCreate(
    customerId: string,
    customerName: string,
    userId: string,
    metadata?: { source?: string; fileName?: string }
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.CREATE,
      entity: AuditEntity.CUSTOMER,
      entityId: customerId,
      userId,
      metadata: {
        ...metadata,
        affectedEntities: [
          {
            entityType: "customer",
            entityId: customerId,
            entityName: customerName,
          },
        ],
      },
    });
  }

  /**
   * Shartnoma yaratish audit log
   */
  async logContractCreate(
    contractId: string,
    customerId: string,
    customerName: string,
    productName: string,
    totalPrice: number,
    userId: string,
    metadata?: { source?: string; fileName?: string }
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.CREATE,
      entity: AuditEntity.CONTRACT,
      entityId: contractId,
      userId,
      metadata: {
        ...metadata,
        totalPrice,
        affectedEntities: [
          {
            entityType: "contract",
            entityId: contractId,
            entityName: `${customerName} - ${productName}`,
          },
          {
            entityType: "customer",
            entityId: customerId,
            entityName: customerName,
          },
        ],
      },
    });
  }

  /**
   * To'lov yaratish audit log
   */
  async logPaymentCreate(
    paymentId: string,
    contractId: string,
    customerId: string,
    customerName: string,
    amount: number,
    paymentType: string,
    targetMonth: number,
    userId: string,
    metadata?: { 
      source?: string; 
      fileName?: string;
      expectedAmount?: number; // Kutilgan summa
      actualAmount?: number; // Haqiqatda to'langan
      paymentStatus?: string; // PAID, UNDERPAID, OVERPAID, etc.
      remainingAmount?: number; // Qarz
      excessAmount?: number; // Ortiqcha
    }
  ): Promise<void> {
    // Payment status va summa ma'lumotlarini metadata'ga qo'shish
    const paymentMetadata = {
      ...metadata,
      amount: metadata?.actualAmount || amount, // Haqiqatda to'langan summa
      expectedAmount: metadata?.expectedAmount || amount, // Kutilgan summa
      paymentType,
      targetMonth,
      paymentStatus: metadata?.paymentStatus,
      remainingAmount: metadata?.remainingAmount,
      excessAmount: metadata?.excessAmount,
    };

    // Entity name'da qarz holatini ko'rsatish
    let entityName = `${customerName} - $${metadata?.actualAmount || amount}`;
    
    if (metadata?.paymentStatus === 'UNDERPAID' && metadata?.remainingAmount) {
      entityName += ` (${targetMonth}-oy, ${metadata.remainingAmount}$ qarz)`;
    } else if (metadata?.paymentStatus === 'OVERPAID' && metadata?.excessAmount) {
      entityName += ` (${targetMonth}-oy, +${metadata.excessAmount}$ ortiqcha)`;
    } else {
      entityName += ` (${targetMonth}-oy)`;
    }

    await this.createLog({
      action: AuditAction.PAYMENT,
      entity: AuditEntity.PAYMENT,
      entityId: paymentId,
      userId,
      metadata: {
        ...paymentMetadata,
        customerName, // Mijoz ismini qo'shamiz
        affectedEntities: [
          {
            entityType: "payment",
            entityId: paymentId,
            entityName,
          },
          {
            entityType: "contract",
            entityId: contractId,
            entityName: `Contract: ${customerName}`,
          },
          {
            entityType: "customer",
            entityId: customerId,
            entityName: customerName,
          },
        ],
      },
    });
  }

  /**
   * Xarajatlar (Expenses) yaratish audit log
   */
  async logExpensesCreate(
    expensesId: string,
    managerId: string,
    managerName: string,
    dollar: number,
    sum: number,
    notes: string,
    userId: string
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.CREATE,
      entity: AuditEntity.EXPENSES,
      entityId: expensesId,
      userId,
      metadata: {
        dollar,
        sum,
        expensesNotes: notes,
        managerName,
        affectedEntities: [
          {
            entityType: "expenses",
            entityId: expensesId,
            entityName: `${managerName} - $${dollar}`,
          },
          {
            entityType: "employee",
            entityId: managerId,
            entityName: managerName,
          },
        ],
      },
    });
  }

  /**
   * Xarajatlar (Expenses) qaytarish audit log
   */
  async logExpensesReturn(
    expensesId: string,
    managerId: string,
    managerName: string,
    dollar: number,
    sum: number,
    userId: string
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.DELETE,
      entity: AuditEntity.EXPENSES,
      entityId: expensesId,
      userId,
      metadata: {
        dollar,
        sum,
        managerName,
        affectedEntities: [
          {
            entityType: "expenses",
            entityId: expensesId,
            entityName: `${managerName} - Qaytarildi ($${dollar})`,
          },
        ],
      },
    });
  }

  /**
   * Excel import audit log
   */
  async logExcelImport(
    fileName: string,
    totalRows: number,
    successfulRows: number,
    failedRows: number,
    userId: string,
    affectedEntities: {
      entityType: string;
      entityId: string;
      entityName: string;
    }[]
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.BULK_IMPORT,
      entity: AuditEntity.EXCEL_IMPORT,
      userId,
      metadata: {
        fileName,
        totalRows,
        successfulRows,
        failedRows,
        affectedEntities,
      },
    });
  }

  /**
   * Mijoz tahrirlash audit log
   */
  async logCustomerUpdate(
    customerId: string,
    customerName: string,
    changes: { field: string; oldValue: any; newValue: any }[],
    userId: string
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.UPDATE,
      entity: AuditEntity.CUSTOMER,
      entityId: customerId,
      userId,
      changes,
      metadata: {
        affectedEntities: [
          {
            entityType: "customer",
            entityId: customerId,
            entityName: customerName,
          },
        ],
      },
    });
  }

  /**
   * Shartnoma tahrirlash audit log
   */
  async logContractUpdate(
    contractId: string,
    customerId: string,
    customerName: string,
    changes: { field: string; oldValue: any; newValue: any }[],
    userId: string,
    affectedPaymentIds?: string[]
  ): Promise<void> {
    const affectedEntities = [
      {
        entityType: "contract",
        entityId: contractId,
        entityName: customerName,
      },
      {
        entityType: "customer", 
        entityId: customerId,
        entityName: customerName,
      },
    ];

    // Affected payments qo'shish
    if (affectedPaymentIds) {
      affectedPaymentIds.forEach((paymentId, index) => {
        affectedEntities.push({
          entityType: "payment",
          entityId: paymentId,
          entityName: `Payment ${index + 1}`,
        });
      });
    }

    await this.createLog({
      action: AuditAction.UPDATE,
      entity: AuditEntity.CONTRACT,
      entityId: contractId,
      userId,
      changes,
      metadata: {
        affectedEntities,
      },
    });
  }

  /**
   * To'lov tasdiqlash/rad etish audit log
   */
  async logPaymentConfirm(
    paymentId: string,
    contractId: string,
    customerId: string,
    customerName: string,
    action: "confirm" | "reject",
    amount: number,
    userId: string
  ): Promise<void> {
    await this.createLog({
      action: action === "confirm" ? AuditAction.CONFIRM : AuditAction.REJECT,
      entity: AuditEntity.PAYMENT,
      entityId: paymentId,
      userId,
      metadata: {
        amount,
        paymentStatus: action === "confirm" ? "confirmed" : "rejected",
        affectedEntities: [
          {
            entityType: "payment",
            entityId: paymentId,
            entityName: `${customerName} - ${amount}$`,
          },
          {
            entityType: "contract",
            entityId: contractId,
            entityName: `Contract: ${customerName}`,
          },
          {
            entityType: "customer",
            entityId: customerId,
            entityName: customerName,
          },
        ],
      },
    });
  }

  /**
   * Login audit log
   */
  async logLogin(
    userId: string,
    userName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.createLog({
      action: AuditAction.LOGIN,
      entity: AuditEntity.AUTH,
      userId,
      ipAddress,
      userAgent,
      metadata: {
        affectedEntities: [
          {
            entityType: "employee",
            entityId: userId,
            entityName: userName,
          },
        ],
      },
    });
  }

  /**
   * Kunlik aktiv faoliyat olish (optimized with limit)
   * 
   * @param date - Allaqachon UTC formatda kelgan sana (controller'dan parseUzbekistanDate orqali)
   * @param limit - Maksimal yozuvlar soni
   */
  async getDailyActivity(date: Date = new Date(), limit: number = 100) {
    // Controller'dan kelgan date allaqachon to'g'ri UTC formatda:
    // "2025-12-19" => 2025-12-18T19:00:00.000Z (19-dekabr 00:00 Toshkent)
    // "2025-12-20" => 2025-12-19T19:00:00.000Z (20-dekabr 00:00 Toshkent)
    
    const { getUzbekistanDayEnd } = require('../utils/helpers/date.helper');
    
    // Start date allaqachon to'g'ri
    const startOfDay = date;
    
    // End date'ni hisoblash
    // date = 2025-12-18T19:00:00.000Z => bu 19-dekabrning boshi
    // Bizga 19-dekabrning oxiri kerak: 2025-12-19T18:59:59.999Z
    // 
    // UTC date'dan original date string'ni qayta yaratish:
    // 2025-12-18T19:00:00.000Z + 5 soat = 2025-12-19T00:00 (Toshkent)
    const dateObj = new Date(date.getTime() + 5 * 60 * 60 * 1000); // +5 soat
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    const endOfDay = getUzbekistanDayEnd(dateString);

    const activities = await AuditLog.find({
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
    .select('-userAgent -ipAddress') // Keraksiz fieldlarni o'chirish
    .populate("userId", "firstName lastName role")
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

    return activities;
  }

  /**
   * Entity bo'yicha history olish
   */
  async getEntityHistory(entityType: AuditEntity, entityId: string) {
    const history = await AuditLog.find({
      entity: entityType,
      entityId,
    })
    .populate("userId", "firstName lastName role")
    .sort({ timestamp: -1 })
    .lean();

    return history;
  }

  /**
   * User activity olish
   */
  async getUserActivity(userId: string, limit: number = 50) {
    const activity = await AuditLog.find({
      userId: new Types.ObjectId(userId),
    })
    .populate("userId", "firstName lastName role")
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

    return activity;
  }

  /**
   * Activity statistics
   */
  async getActivityStats(startDate: Date, endDate: Date) {
    const stats = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            action: "$action",
            entity: "$entity",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.entity",
          actions: {
            $push: {
              action: "$_id.action",
              count: "$count",
            },
          },
          totalCount: { $sum: "$count" },
        },
      },
    ]);

    return stats;
  }
}

export default new AuditLogService();