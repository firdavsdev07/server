import { Request, Response, NextFunction } from "express";
import auditLogService from "../services/audit-log.service";
import { AuditAction, AuditEntity } from "../schemas/audit-log.schema";
import IJwtUser from "../types/user";
import logger from "../utils/logger";

/**
 * Audit log uchun middleware
 * Request va response ma'lumotlarini yozib boradi
 */
export const auditLogMiddleware = (
  action: AuditAction,
  entity: AuditEntity,
  options?: {
    getEntityId?: (req: Request, res: Response) => string | undefined;
    getEntityName?: (req: Request, res: Response) => string | undefined;
    skipIf?: (req: Request, res: Response) => boolean;
    includeBody?: boolean;
  }
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Original send methodini saqlash
    const originalSend = res.send;

    // Response data ni capture qilish
    let responseData: any;
    
    res.send = function (data: any) {
      responseData = data;
      return originalSend.call(this, data);
    };

    // Response tugagandan so'ng audit log yozish
    res.on('finish', async () => {
      try {
        const user = req.user as IJwtUser;
        
        // User yo'q bo'lsa skip qilish
        if (!user) return;

        // Skip condition tekshirish
        if (options?.skipIf && options.skipIf(req, res)) {
          return;
        }

        // Status code 200-299 oralig'ida bo'lmasa skip qilish
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return;
        }

        // Entity ID ni olish
        let entityId: string | undefined;
        if (options?.getEntityId) {
          entityId = options.getEntityId(req, res);
        } else if (req.params.id) {
          entityId = req.params.id;
        } else if (req.params.customerId) {
          entityId = req.params.customerId;
        } else if (req.params.contractId) {
          entityId = req.params.contractId;
        } else if (req.params.paymentId) {
          entityId = req.params.paymentId;
        }

        // Entity name ni olish
        let entityName: string | undefined;
        if (options?.getEntityName) {
          entityName = options.getEntityName(req, res);
        }

        // Changes ni detect qilish (UPDATE uchun)
        let changes: { field: string; oldValue: any; newValue: any; }[] | undefined;
        if (action === AuditAction.UPDATE && options?.includeBody && req.body) {
          changes = Object.keys(req.body).map(field => ({
            field,
            oldValue: "previous_value", // Bu qiymat service da to'ldirilishi kerak
            newValue: req.body[field],
          }));
        }

        // IP address va User Agent olish
        const ipAddress = req.ip || 
          req.connection.remoteAddress || 
          req.headers['x-forwarded-for'] as string ||
          req.headers['x-real-ip'] as string;
          
        const userAgent = req.headers['user-agent'];

        // Audit log yaratish
        await auditLogService.createLog({
          action,
          entity,
          entityId,
          userId: user.sub,
          changes,
          metadata: {
            affectedEntities: entityId ? [{
              entityType: entity,
              entityId,
              entityName: entityName || `${entity}:${entityId}`,
            }] : undefined,
          },
          ipAddress,
          userAgent,
        });

      } catch (error) {
        logger.error("❌ Error in audit log middleware:", error);
        // Middleware xatosi asosiy jarayonni buzmasligi kerak
      }
    });

    next();
  };
};

/**
 * Customer uchun audit log middleware
 */
export const auditCustomerCreate = auditLogMiddleware(
  AuditAction.CREATE,
  AuditEntity.CUSTOMER,
  {
    getEntityId: (req, res) => {
      // Response dan customer ID ni olish
      try {
        const responseBody = JSON.parse(res.get('audit-response') || '{}');
        return responseBody.data?.customer?._id || responseBody.data?._id;
      } catch {
        return undefined;
      }
    },
    getEntityName: (req, res) => {
      const { fullName } = req.body;
      return fullName;
    },
  }
);

export const auditCustomerUpdate = auditLogMiddleware(
  AuditAction.UPDATE,
  AuditEntity.CUSTOMER,
  {
    includeBody: true,
    getEntityName: (req, res) => {
      const { fullName } = req.body;
      return fullName || undefined;
    },
  }
);

/**
 * Contract uchun audit log middleware
 */
export const auditContractCreate = auditLogMiddleware(
  AuditAction.CREATE,
  AuditEntity.CONTRACT,
  {
    getEntityId: (req, res) => {
      try {
        const responseBody = JSON.parse(res.get('audit-response') || '{}');
        return responseBody.data?.contract?._id || responseBody.data?._id;
      } catch {
        return undefined;
      }
    },
    getEntityName: (req, res) => {
      const { productName } = req.body;
      return productName;
    },
  }
);

export const auditContractUpdate = auditLogMiddleware(
  AuditAction.UPDATE,
  AuditEntity.CONTRACT,
  {
    includeBody: true,
  }
);

/**
 * Payment uchun audit log middleware
 */
export const auditPaymentCreate = auditLogMiddleware(
  AuditAction.PAYMENT,
  AuditEntity.PAYMENT,
  {
    getEntityId: (req, res) => {
      try {
        const responseBody = JSON.parse(res.get('audit-response') || '{}');
        return responseBody.data?.payment?._id || responseBody.data?._id;
      } catch {
        return undefined;
      }
    },
  }
);

export const auditPaymentConfirm = auditLogMiddleware(
  AuditAction.CONFIRM,
  AuditEntity.PAYMENT
);

export const auditPaymentReject = auditLogMiddleware(
  AuditAction.REJECT,
  AuditEntity.PAYMENT
);

/**
 * Response data ni audit uchun saqlash utility
 */
export const setAuditResponse = (res: Response, data: any) => {
  res.set('audit-response', JSON.stringify(data));
  return data;
};